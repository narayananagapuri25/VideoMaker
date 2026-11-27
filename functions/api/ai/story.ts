import { generateStoryWithAvailableProviders, parseProviderHealthFromRequest } from "../../../src/lib/multi-ai";
import { checkSameOrigin, jsonNoStore, parseJsonBody, providerError, resolveAIRequestCredentials, type PagesContext } from "./_shared";
import type { AspectRatio, Language } from "../../../src/types";

const languages: Language[] = ["English", "Hinglish", "Hindi", "Telugu"];
const ratios: AspectRatio[] = ["9:16", "16:9"];
const providers = ["gemini", "groq", "openrouter"] as const;

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

  const selected = request.headers.get("X-SochoZara-AI-Provider")?.trim();
  if (!selected || !providers.includes(selected as typeof providers[number])) {
    return jsonNoStore({ error: "Choose and save one AI provider before generating a video.", code: "AI_PROVIDER_REQUIRED" }, 400);
  }

  const credentials = resolveAIRequestCredentials(request, env);
  // Strict single-provider execution. Other connected credentials and the
  // Cloudflare Workers AI binding are deliberately excluded from this request.
  credentials.cloudflareAI = undefined;
  credentials.cloudflareApiToken = undefined;
  credentials.cloudflareAccountId = undefined;
  if (selected === "gemini") {
    if (request.headers.get("X-SochoZara-Gemini-Free-Use") !== "true") {
      return jsonNoStore({ error: "Confirm that Gemini is on its Free Tier with paid billing disabled.", code: "GEMINI_FREE_TIER_CONFIRMATION_REQUIRED" }, 403);
    }
    credentials.groq = undefined;
    credentials.openrouter = undefined;
  } else if (selected === "groq") {
    if (request.headers.get("X-SochoZara-Groq-Free-Use") !== "true") {
      return jsonNoStore({ error: "Confirm that Groq is on its Free Developer plan with paid billing disabled.", code: "GROQ_FREE_PLAN_CONFIRMATION_REQUIRED" }, 403);
    }
    credentials.gemini = undefined;
    credentials.openrouter = undefined;
  } else {
    credentials.gemini = undefined;
    credentials.groq = undefined;
  }

  const hasProvider = selected === "gemini" ? Boolean(credentials.gemini)
    : selected === "groq" ? Boolean(credentials.groq)
      : Boolean(credentials.openrouter);
  if (!hasProvider) {
    return jsonNoStore({ error: "The selected AI key is missing from this browser tab. Save the key again and retry.", code: "SELECTED_AI_KEY_MISSING" }, 503);
  }

  try {
    const result = await generateStoryWithAvailableProviders({
      topic,
      language: language as Language,
      aspectRatio: aspectRatio as AspectRatio,
      targetDuration,
      credentials,
      providerHealth: parseProviderHealthFromRequest(request),
    });
    // This is not a cross-provider fallback: the request contains exactly one
    // eligible provider and stops when that provider is unavailable or out of quota.
    return jsonNoStore({ story: result.story, source: result.source, attempted: result.attempted, fallbackNotice: result.fallbackNotice, providerHealth: result.providerHealth });
  } catch (error) {
    const providerHealth = error && typeof error === "object" && "providerHealth" in error
      ? (error as Error & { providerHealth?: unknown }).providerHealth
      : undefined;
    const result = providerError(error);
    if (providerHealth) return jsonNoStore({ ...await result.json() as Record<string, unknown>, providerHealth }, result.status);
    return result;
  }
}
