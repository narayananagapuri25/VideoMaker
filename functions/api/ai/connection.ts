import { testGeminiConnectionWithApiKey } from "../../../src/lib/ai";
import { checkSameOrigin, jsonNoStore, providerError, requireGeminiKey, type PagesContext } from "./_shared";

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const apiKey = requireGeminiKey(env);
  if (apiKey instanceof Response) return apiKey;
  try {
    const message = await testGeminiConnectionWithApiKey(apiKey);
    return jsonNoStore({ message: "Secure server connection successful. " + message });
  } catch (error) {
    return providerError(error);
  }
}
