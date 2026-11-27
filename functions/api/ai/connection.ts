import { testGeminiConnectionWithApiKey } from "../../../src/lib/ai";
import { testSecondaryAIProvider } from "../../../src/lib/multi-ai";
import type { SecondaryAIProvider } from "../../../src/lib/ai-provider-session";
import { checkSameOrigin, jsonNoStore, providerError, requireGeminiKey, resolveAIRequestCredentials, type PagesContext } from "./_shared";

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const provider = request.headers.get("X-SochoZara-AI-Provider")?.trim();
  try {
    if (provider === "cloudflare" && request.headers.get("X-SochoZara-Cloudflare-Free-Use") !== "true") {
      return jsonNoStore({
        error: "Confirm that this API token belongs to a Cloudflare Workers Free account before testing or using its daily free allocation.",
        code: "CLOUDFLARE_FREE_PLAN_CONFIRMATION_REQUIRED",
      }, 403);
    }
    if (provider === "groq" || provider === "openrouter" || provider === "cloudflare") {
      const message = await testSecondaryAIProvider(provider as SecondaryAIProvider, resolveAIRequestCredentials(request, env));
      return jsonNoStore({ provider, message });
    }
    const apiKey = requireGeminiKey(request, env);
    if (apiKey instanceof Response) return apiKey;
    const message = await testGeminiConnectionWithApiKey(apiKey);
    return jsonNoStore({ provider: "gemini", message: "Gemini connection successful for this request. " + message });
  } catch (error) {
    return providerError(error);
  }
}
