import { testGeminiConnectionWithApiKey } from "../../../src/lib/ai";
import { testSecondaryAIProvider } from "../../../src/lib/multi-ai";
import type { SecondaryAIProvider } from "../../../src/lib/ai-provider-session";
import { checkSameOrigin, jsonNoStore, providerError, requireGeminiKey, resolveAIRequestCredentials, type PagesContext } from "./_shared";

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const provider = request.headers.get("X-SochoZara-AI-Provider")?.trim();
  try {
    if (provider === "groq" && request.headers.get("X-SochoZara-Groq-Free-Use") !== "true") {
      return jsonNoStore({ error: "Confirm that this Groq account is on its Free Developer plan and has no paid API billing enabled before testing or using it.", code: "GROQ_FREE_PLAN_CONFIRMATION_REQUIRED" }, 403);
    }
    if (provider === "cloudflare" && request.headers.get("X-SochoZara-Cloudflare-Free-Use") !== "true") {
      return jsonNoStore({
        error: "Confirm that this Cloudflare account is on the Workers Free plan before using the included 10,000-Neuron daily allocation. The app must not use paid overage.",
        code: "CLOUDFLARE_FREE_PLAN_CONFIRMATION_REQUIRED",
      }, 403);
    }
    if (provider === "groq" || provider === "openrouter" || provider === "cloudflare") {
      const credentials = resolveAIRequestCredentials(request, env);
      if (provider === "cloudflare") credentials.cloudflareAI = env.AI;
      const message = await testSecondaryAIProvider(provider as SecondaryAIProvider, credentials);
      return jsonNoStore({ provider, message });
    }
    if (request.headers.get("X-SochoZara-Gemini-Free-Use") !== "true") {
      return jsonNoStore({ error: "Confirm that this Gemini key is using the Google AI Studio Free Tier and has no paid billing or usage enabled before testing or generating.", code: "GEMINI_FREE_TIER_CONFIRMATION_REQUIRED" }, 403);
    }
    const apiKey = requireGeminiKey(request, env);
    if (apiKey instanceof Response) return apiKey;
    const message = await testGeminiConnectionWithApiKey(apiKey);
    return jsonNoStore({ provider: "gemini", message: "Gemini connection successful for this request. " + message });
  } catch (error) {
    const providerName = provider === "cloudflare" ? "Cloudflare Workers AI" : provider === "groq" ? "Groq" : provider === "openrouter" ? "OpenRouter" : "Gemini";
    return providerError(error, providerName);
  }
}
