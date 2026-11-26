import { jsonNoStore, type PagesContext } from "./_shared";

export async function onRequestGet({ env }: PagesContext): Promise<Response> {
  return jsonNoStore({
    configured: Boolean(env.GEMINI_API_KEY?.trim()),
    provider: "Gemini",
    storage: "Cloudflare encrypted Pages secret",
  });
}
