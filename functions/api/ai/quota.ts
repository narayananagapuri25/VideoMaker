import { getProviderQuotaSnapshot, parseProviderHealthFromRequest } from "../../../src/lib/multi-ai";
import {
  checkSameOrigin,
  jsonNoStore,
  resolveAIRequestCredentials,
  type PagesContext,
} from "./_shared";

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const credentials = resolveAIRequestCredentials(request, env);
  if (request.headers.get("X-SochoZara-Gemini-Free-Use") !== "true") credentials.gemini = undefined;
  if (request.headers.get("X-SochoZara-Groq-Free-Use") !== "true") credentials.groq = undefined;
  if (request.headers.get("X-SochoZara-Cloudflare-Free-Use") !== "true") {
    credentials.cloudflareApiToken = undefined;
    credentials.cloudflareAccountId = undefined;
  }

  const providerHealth = await getProviderQuotaSnapshot(
    credentials,
    parseProviderHealthFromRequest(request),
  );
  return jsonNoStore({
    providerHealth,
    message: "Only quota metadata was refreshed. No story, narration or video generation was run.",
  });
}
