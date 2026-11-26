import type { AspectRatio, GeneratedStory, Language } from "../types";
import { buildLocalStory } from "./story";

interface GenerateOptions {
  topic: string;
  language: Language;
  targetDuration: number;
  aspectRatio: AspectRatio;
  apiKey?: string;
}

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_TEXT_MODEL = "gemini-4-hydrogen";
const GEMINI_API_REVISION = "2026-05-20";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_SCENES = 12;
const MAX_TOPIC_LENGTH = 2_000;
const MAX_SCRIPT_LENGTH = 60_000;

const STORY_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    script: { type: "string" },
    editorialNote: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          narration: { type: "string" },
          caption: { type: "string" },
          visualPrompt: { type: "string" },
          duration: { type: "number" },
        },
        required: ["title", "narration", "caption", "visualPrompt", "duration"],
      },
    },
  },
  required: ["title", "script", "editorialNote", "scenes"],
} as const;

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
    const rawDuration = Number(entry.duration);
    const duration = Number.isFinite(rawDuration) ? Math.max(1, Math.min(90, rawDuration)) : 5;
    return {
      title: boundedText(entry.title ?? "Scene " + (index + 1), 200, "scene title", false),
      narration,
      caption: caption || narration,
      visualPrompt: boundedText(entry.visualPrompt ?? "", 6_000, "visual prompt"),
      duration,
    };
  });
  const editorialNote = value.editorialNote === undefined
    ? undefined
    : boundedText(value.editorialNote, 8_000, "editorial note");
  return { title, script, scenes, editorialNote };
}

function getProviderMessage(raw: string): string {
  try {
    const payload: unknown = JSON.parse(raw);
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message.slice(0, 500);
    }
  } catch {
    // Some gateways return plain-text errors instead of Google's JSON shape.
  }
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

function explainProviderError(status: number, detail: string): string {
  const message = getProviderMessage(detail);
  if (status === 400) {
    return "Gemini rejected the story request (400). Check the request or selected model and retry. " + message;
  }
  if (status === 401) {
    return "Gemini rejected the API key (401). Create or copy an active key from Google AI Studio and paste it without spaces. " + message;
  }
  if (status === 403) {
    return "Gemini denied API access (403). Check that the key's Google project is enabled and eligible for Gemini API access/free-tier use. " + message;
  }
  if (status === 404) {
    return "Gemini could not find the requested model or endpoint (404). Check model availability for this API project. " + message;
  }
  if (status === 429) {
    return "Gemini quota or rate limit reached (429). Check AI Studio usage limits and try again later. " + message;
  }
  if (status >= 500) {
    return "Gemini is temporarily unavailable (" + status + "). Please retry shortly. " + message;
  }
  return "Gemini request failed (" + status + "): " + message;
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
    if (error instanceof TypeError) {
      throw new Error("Could not connect to Gemini from this browser. Check your internet connection, VPN or content blocker, then retry.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function extractInteractionText(payload: unknown): string {
  if (!isRecord(payload)) return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  if (!Array.isArray(payload.steps)) return "";

  return payload.steps
    .filter((step): step is Record<string, unknown> => isRecord(step) && step.type === "model_output")
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
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
    "Create 4 to 8 scenes. The sum of scene durations should be close to the target duration. Scene narration must faithfully cover the complete script without adding unrelated filler.",
    "The script must be complete and suitable for narration. Captions should be short, readable on mobile and faithful to each scene.",
    "Return the requested JSON object only. Do not wrap it in Markdown fences or add commentary.",
  ].join("\n");

  const response = await fetchWithTimeout(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim(),
      "Api-Revision": GEMINI_API_REVISION,
    },
    body: JSON.stringify({
      model: GEMINI_TEXT_MODEL,
      input: prompt,
      store: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: STORY_JSON_SCHEMA,
      },
    }),
  }, REQUEST_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(explainProviderError(response.status, await response.text()));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Gemini returned an unreadable response. Please retry the generation.");
  }

  const responseText = extractInteractionText(payload);
  if (!responseText) {
    const state = isRecord(payload) && typeof payload.status === "string" ? payload.status : "unknown";
    throw new Error("Gemini completed without returning story text (status: " + state + "). Try a shorter topic or generate again.");
  }
  return { story: parseStory(responseText), source: "gemini" };
}
