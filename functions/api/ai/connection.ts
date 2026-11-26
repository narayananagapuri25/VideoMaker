import { testGeminiConnectionWithApiKey } from "../../../src/lib/ai";
import { testSecondaryAIProvider } from "../../../src/lib/multi-ai";
import type { SecondaryAIProvider } from "../../../src/lib/ai-provider-session";
import { checkSameOrigin, jsonNoStore, providerError, requireGeminiKey, resolveAIRequestCredentials, type PagesContext } from "./_shared";

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const apiKey = requireGeminiKey(request, env);
  if (apiKey instanceof Response) return apiKey;
  try {
    const message = await testGeminiConnectionWithApiKey(apiKey);
    return jsonNoStore({ message: "Gemini connection successful for this request. " + message });
  } catch (error) {
    return providerError(error);
  }
}
