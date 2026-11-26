import { generateStoryWithAvailableProviders } from "../../../src/lib/multi-ai";
import { checkSameOrigin, jsonNoStore, parseJsonBody, providerError, resolveAIRequestCredentials, type PagesContext } from "./_shared";
import type { AspectRatio, Language } from "../../../src/types";

const languages: Language[] = ["English", "Hinglish", "Hindi", "Telugu"];
const ratios: AspectRatio[] = ["9:16", "16:9"];

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
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

  const credentials = resolveAIRequestCredentials(request, env);
  const hasProvider = Boolean(
    credentials.gemini || credentials.groq || credentials.openrouter ||
    (credentials.cloudflareApiToken && credentials.cloudflareAccountId)
  );
  if (!hasProvider) {
    return jsonNoStore({
      error: "Connect at least one AI provider in the Studio: Gemini, Groq, OpenRouter or Cloudflare Workers AI.",
      code: "AI_PROVIDERS_NOT_CONFIGURED",
    }, 503);
  }

  try {
    const result = await generateStoryWithAvailableProviders({
      topic,
      language: language as Language,
      aspectRatio: aspectRatio as AspectRatio,
      targetDuration,
      credentials,
    });
    return jsonNoStore({ story: result.story, source: result.source, attempted: result.attempted, fallbackNotice: result.fallbackNotice });
  } catch (error) {
    return providerError(error);
  }
}
