import { checkSameOrigin, jsonNoStore, parseJsonBody, providerError, type PagesContext } from "./_shared";

const MODEL = "@cf/deepgram/aura-1";
const MAX_SCRIPT_CHARACTERS = 12_000;

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  if (request.headers.get("X-SochoZara-AI-Provider") !== "cloudflare") {
    return jsonNoStore({ error: "Cloudflare narration is available only when Cloudflare Workers AI is selected.", code: "SCENE_TTS_PROVIDER_MISMATCH" }, 403);
  }
  if (request.headers.get("X-SochoZara-Cloudflare-Free-Use") !== "true") {
    return jsonNoStore({ error: "Confirm Cloudflare Workers Free use before generating narration.", code: "CLOUDFLARE_FREE_PLAN_CONFIRMATION_REQUIRED" }, 403);
  }
  if (!env.AI) {
    return jsonNoStore({ error: "Cloudflare Workers AI is not attached to this Pages project. Add the AI binding named AI in Pages settings and redeploy.", code: "CLOUDFLARE_AI_BINDING_MISSING" }, 503);
  }

  const body = await parseJsonBody(request, 16_000);
  if (body instanceof Response) return body;
  const text = typeof body.script === "string" ? body.script.trim() : "";
  const language = typeof body.language === "string" ? body.language : "English";
  if (!text || text.length > MAX_SCRIPT_CHARACTERS) {
    return jsonNoStore({ error: "Enter narration between 1 and 12,000 characters.", code: "NARRATION_TEXT_INVALID" }, 400);
  }
  if (language !== "English") {
    return jsonNoStore({
      error: "Cloudflare Workers AI Aura-1 is configured here for English narration. No other provider was called. Hindi, Telugu and Hinglish narration need a supported multilingual free model before they can be generated reliably.",
      code: "CLOUDFLARE_TTS_LANGUAGE_UNSUPPORTED",
    }, 422);
  }

  try {
    const result = await env.AI.run(MODEL, {
      text,
      speaker: "luna",
      encoding: "mp3",
      bit_rate: 128_000,
    }, { returnRawResponse: true, rejectIfBusy: true });
    if (!(result instanceof Response)) {
      throw new Error("Cloudflare Aura returned an unexpected audio response. Check the Workers AI model binding and retry.");
    }
    if (!result.ok) {
      const detail = await result.text().catch(() => "No provider details were returned.");
      return providerError(new Error("Aura-1 HTTP (" + result.status + ") · " + detail.slice(0, 500)), "Cloudflare Workers AI narration");
    }
    const audio = await result.arrayBuffer();
    if (!audio.byteLength) throw new Error("Cloudflare Aura returned an empty narration track.");
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline; filename=sochozara-aura-narration.mp3",
        "X-SochoZara-TTS-Provider": "Cloudflare Workers AI · Aura-1",
      },
    });
  } catch (error) {
    return providerError(error, "Cloudflare Workers AI narration");
  }
}
