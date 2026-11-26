import { generateStoryWithAvailableProviders } from "../../../src/lib/multi-ai";
import { checkSameOrigin, jsonNoStore, parseJsonBody, providerError, resolveAIRequestCredentials, type PagesContext } from "./_shared";
import type { AspectRatio, Language } from "../../../src/types";

const languages: Language[] = ["English", "Hinglish", "Hindi", "Telugu"];
const ratios: AspectRatio[] = ["9:16", "16:9"];

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const apiKey = requireGeminiKey(request, env);
  if (apiKey instanceof Response) return apiKey;
  const body = await parseJsonBody(request, 12_000);
  if (body instanceof Response) return body;

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const language = body.language;
  const aspectRatio = body.aspectRatio;
  const targetDuration = Number(body.targetDuration);
  if (!topic || topic.length > 2_000) {
    return jsonNoStore({ error: "Enter a topic between 1 and 2,000 characters." }, 400);
  }
  if (typeof language !== "string" || !languages.includes(language as Language)) {
    return jsonNoStore({ error: "Choose a supported narration language." }, 400);
  }
  if (typeof aspectRatio !== "string" || !ratios.includes(aspectRatio as AspectRatio)) {
    return jsonNoStore({ error: "Choose a supported video aspect ratio." }, 400);
  }
  if (!Number.isFinite(targetDuration) || targetDuration < 10 || targetDuration > 600) {
    return jsonNoStore({ error: "Choose a video duration between 10 seconds and 10 minutes." }, 400);
  }

  try {
    const result = await generateStoryWithAvailableProviders({
      topic,
      language: language as Language,
      aspectRatio: aspectRatio as AspectRatio,
      targetDuration,
      apiKey,
    });
    return jsonNoStore({ story: result.story, source: "gemini" });
  } catch (error) {
    return providerError(error);
  }
}
