import type { AspectRatio, GeneratedStory, Language } from "../types";
import { buildLocalStory } from "./story";

interface GenerateOptions {
  topic: string;
  language: Language;
  targetDuration: number;
  aspectRatio: AspectRatio;
  apiKey?: string;
}

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_SCENES = 12;
const MAX_TOPIC_LENGTH = 2_000;
const MAX_SCRIPT_LENGTH = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number, label: string, allowEmpty = true): string {
  if (typeof value !== "string") throw new Error("The AI response contained an invalid " + label + ".");
  const text = value.trim();
  if (text.length > maxLength) throw new Error("The AI response " + label + " is too long.");
  if (!allowEmpty && !text) throw new Error("The AI response did not contain " + label + ".");
  return text;
}

function parseStory(text: string): GeneratedStory {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text.trim()
    .replace(new RegExp("^\\s*" + fence + "(?:json)?\\s*", "i"), "")
    .replace(new RegExp("\\s*" + fence + "\\s*$"), "");
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini returned invalid JSON. Please retry the generation.");
  }
  if (!isRecord(value) || !Array.isArray(value.scenes) || value.scenes.length < 2 || value.scenes.length > MAX_SCENES) {
    throw new Error("The AI response did not contain a complete storyboard with 2 to 12 scenes.");
  }

  const title = boundedText(value.title, 240, "video title", false);
  const script = boundedText(value.script, MAX_SCRIPT_LENGTH, "script", false);
  const scenes = value.scenes.map((entry, index) => {
    if (!isRecord(entry)) throw new Error("The AI response contains an invalid scene at position " + (index + 1) + ".");
    const narration = boundedText(entry.narration, 12_000, "scene narration");
    const caption = boundedText(entry.caption ?? narration, 3_000, "scene caption");
    return {
      title: boundedText(entry.title ?? "Scene " + (index + 1), 200, "scene title", false),
      narration,
      caption: caption || narration,
      visualPrompt: boundedText(entry.visualPrompt ?? "", 6_000, "visual prompt"),
      duration: Math.max(1, Math.min(90, Number.isFinite(Number(entry.duration)) ? Number(entry.duration) : 5)),
    };
  });
  const editorialNote = value.editorialNote === undefined
    ? undefined
    : boundedText(value.editorialNote, 8_000, "editorial note");
  return { title, script, scenes, editorialNote };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Gemini did not respond within " + Math.round(timeoutMs / 1000) + " seconds. Please retry.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function generateStory(options: GenerateOptions): Promise<{ story: GeneratedStory; source: "gemini" | "local" }> {
  const { topic, language, targetDuration, aspectRatio, apiKey } = options;
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) throw new Error("Enter a topic before generating a story.");
  if (trimmedTopic.length > MAX_TOPIC_LENGTH) throw new Error("Keep the video topic under 2,000 characters.");
  if (!Number.isFinite(targetDuration) || targetDuration < 10 || targetDuration > 600) {
    throw new Error("Choose a video duration between 10 seconds and 10 minutes.");
  }
  if (!apiKey?.trim()) {
    return { story: buildLocalStory(trimmedTopic, language, targetDuration), source: "local" };
  }

  const prompt = [
    "You are the documentary writer and storyboard artist for SochoZara, an original Hinglish-first educational channel.",
    "Create an original, fact-conscious video package for this topic: " + trimmedTopic,
    "Language: " + language + ". Approximate video duration: " + targetDuration + " seconds. Aspect ratio: " + aspectRatio + ".",
    "Write a strong hook, informative narrative, scene-specific narration and visual prompts for original motion graphics or licensed visuals.",
    "Do not invent factual details, dates, statistics or quotations. Where a claim needs verification, mark it [VERIFY] in the narration and note it in editorialNote.",
    "Return ONLY valid JSON with this exact shape: {\"title\":\"...\",\"script\":\"paragraphs separated by blank lines\",\"editorialNote\":\"verification caveats or empty string\",\"scenes\":[{\"title\":\"...\",\"narration\":\"...\",\"caption\":\"...\",\"visualPrompt\":\"...\",\"duration\":8}]}",
    "Create 4 to 8 scenes. The sum of scene durations should be close to the target duration. Scene narration must faithfully cover the complete script without adding unrelated filler.",
  ].join("\n");

  const response = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim(),
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, responseMimeType: "application/json" },
    }),
  }, REQUEST_TIMEOUT_MS);

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error("Gemini request failed (" + response.status + "): " + detail);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Gemini returned an unreadable response. Please retry.");
  }
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) {
    throw new Error("Gemini returned no story candidates. Please retry or use the offline starter.");
  }
  const candidate = payload.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    throw new Error("Gemini did not return a usable story. Check the topic and try again.");
  }
  const responseText = candidate.content.parts
    .filter(isRecord)
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("");
  if (!responseText.trim()) throw new Error("Gemini returned an empty response. Please retry.");
  return { story: parseStory(responseText), source: "gemini" };
}
