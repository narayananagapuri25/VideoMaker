import { jsonNoStore, resolveGeminiKey, type PagesContext } from "./_shared";

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  const sessionKey = request.headers.get("X-SochoZara-Gemini-Key")?.trim();
  const configured = Boolean(resolveGeminiKey(request, env));
  return jsonNoStore({
    configured,
    provider: "Gemini",
    source: sessionKey ? "tab-session" : env.GEMINI_API_KEY?.trim() ? "cloudflare-secret" : "none",
    storage: sessionKey ? "Current browser tab session" : "Cloudflare encrypted Pages secret",
  });
}
