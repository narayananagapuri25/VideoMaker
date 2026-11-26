import type { AspectRatio, GeneratedStory, Language } from "../types";
import { buildLocalStory } from "./story";

interface GenerateOptions {
  topic: string;
  language: Language;
  targetDuration: number;
  aspectRatio: AspectRatio;
  apiKey?: string;
}

function parseStory(text: string): GeneratedStory {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as GeneratedStory;
  if (!parsed.title || !parsed.script || !Array.isArray(parsed.scenes) || parsed.scenes.length < 2) {
    throw new Error("The AI response did not contain a complete storyboard.");
  }
  const scenes = parsed.scenes.map((scene) => ({
    title: String(scene.title || "Scene"),
    narration: String(scene.narration || ""),
    caption: String(scene.caption || scene.narration || ""),
    visualPrompt: String(scene.visualPrompt || ""),
    duration: Math.max(2, Number(scene.duration) || 5),
  }));
  return { title: String(parsed.title), script: String(parsed.script), scenes };
}

export async function generateStory(options: GenerateOptions): Promise<{ story: GeneratedStory; source: "gemini" | "local" }> {
  const { topic, language, targetDuration, aspectRatio, apiKey } = options;
  if (!apiKey?.trim()) {
    return { story: buildLocalStory(topic, language, targetDuration), source: "local" };
  }

  const prompt = [
    "You are the documentary writer and storyboard artist for SochoZara, an original Hinglish-first educational channel.",
    "Create an original, fact-conscious video package for this topic: " + topic,
    "Language: " + language + ". Approximate video duration: " + targetDuration + " seconds. Aspect ratio: " + aspectRatio + ".",
    "Write a strong hook, informative narrative, scene-specific narration and visual prompts for original motion graphics or licensed visuals.",
    "Do not invent factual details, dates, statistics or quotations. Where a claim needs verification, mark it [VERIFY] in the narration and note it in the visual prompt.",
    "Return ONLY valid JSON with this exact shape: {\"title\":\"...\",\"script\":\"paragraphs separated by blank lines\",\"scenes\":[{\"title\":\"...\",\"narration\":\"...\",\"caption\":\"...\",\"visualPrompt\":\"...\",\"duration\":8}]}",
    "Create 4 to 8 scenes. The sum of scene durations should be close to the target duration."
  ].join("\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + encodeURIComponent(apiKey.trim()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error("Gemini request failed (" + response.status + "): " + detail.slice(0, 240));
  }
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return { story: parseStory(text), source: "gemini" };
}