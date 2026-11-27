import { generateNarrationWithApiKey } from "../../../src/lib/tts";
import {
  checkSameOrigin,
  jsonNoStore,
  parseJsonBody,
  providerError,
  resolveAIRequestCredentials,
  type PagesContext,
} from "./_shared";
import type { Language } from "../../../src/types";

const languages: Language[] = ["English", "Hinglish", "Hindi", "Telugu"];
const voices = ["Kore", "Aoede", "Puck", "Charon", "Fenrir", "Zephyr"];
const MAX_CLOUDFLARE_TTS_CHARACTERS = 2_500;
const CLOUDFLARE_TTS_MODEL = "@cf/deepgram/aura-2-en";

async function generateCloudflareEnglishNarration(
  script: string,
  accountId: string,
  apiToken: string,
): Promise<Response> {
  if (script.length > MAX_CLOUDFLARE_TTS_CHARACTERS) {
    return jsonNoStore({
      error: "The free Cloudflare voice fallback is limited to English scripts up to 2,500 characters. Shorten the narration or use an imported voice track.",
      code: "CLOUDFLARE_TTS_TEXT_TOO_LONG",
    }, 413);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/run/" + CLOUDFLARE_TTS_MODEL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiToken,
        },
        body: JSON.stringify({ text: script, speaker: "luna", encoding: "mp3" }),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return jsonNoStore({ error: "Cloudflare Workers AI could not be reached for free English narration. No paid voice provider was contacted.", code: "CLOUDFLARE_TTS_NETWORK" }, 504);
  }

  if (!upstream.ok) {
    let detail = "Cloudflare Workers AI rejected the free narration request (HTTP " + upstream.status + ").";
    try {
      const payload: unknown = await upstream.json();
      if (typeof payload === "object" && payload !== null && "errors" in payload && Array.isArray(payload.errors)) {
        const first = payload.errors[0];
        if (typeof first === "object" && first !== null && "message" in first && typeof first.message === "string") detail = first.message;
      } else if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
        detail = payload.error;
      }
    } catch {
      // Keep the HTTP status-based message.
    }
    const safeStatus = upstream.status === 429 ? 429 : upstream.status === 401 ? 502 : upstream.status >= 500 ? 502 : upstream.status;
    return jsonNoStore({
      error: detail.slice(0, 700) + " The confirmed Workers Free allocation may be exhausted; VideoMaker will not switch to paid usage.",
      code: upstream.status === 429 ? "CLOUDFLARE_FREE_NEURON_LIMIT" : "CLOUDFLARE_TTS_UPSTREAM",
      upstreamStatus: upstream.status,
    }, safeStatus);
  }

  const contentType = upstream.headers.get("Content-Type") || "audio/mpeg";
  if (!contentType.toLowerCase().includes("audio")) {
    await upstream.body?.cancel().catch(() => undefined);
    return jsonNoStore({ error: "Cloudflare returned an unexpected response instead of audio.", code: "CLOUDFLARE_TTS_INVALID_RESPONSE" }, 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline; filename=sochozara-cloudflare-narration.mp3",
      "X-SochoZara-TTS-Provider": "Cloudflare Workers AI · Aura-2",
    },
  });
}

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const body = await parseJsonBody(request, 40_000);
  if (body instanceof Response) return body;

  const script = typeof body.script === "string" ? body.script.trim() : "";
  const voice = typeof body.voice === "string" ? body.voice : "Kore";
  const language = typeof body.language === "string" ? body.language : "English";
  if (!script || script.length > 26_000) {
    return jsonNoStore({ error: "Enter narration between 1 and 26,000 characters." }, 400);
  }
  if (!voices.includes(voice)) {
    return jsonNoStore({ error: "Choose a supported narrator voice." }, 400);
  }
  if (!languages.includes(language as Language)) {
    return jsonNoStore({ error: "Choose a supported narration language." }, 400);
  }

  const credentials = resolveAIRequestCredentials(request, env);
  if (request.headers.get("X-SochoZara-Gemini-Free-Use") !== "true") credentials.gemini = undefined;
  if (request.headers.get("X-SochoZara-Cloudflare-Free-Use") !== "true") {
    credentials.cloudflareApiToken = undefined;
    credentials.cloudflareAccountId = undefined;
  }

  let geminiFailure: unknown;
  if (credentials.gemini) {
    try {
      const audio = await generateNarrationWithApiKey(script, credentials.gemini, voice, language as Language);
      return new Response(audio, {
        status: 200,
        headers: {
          "Content-Type": audio.type || "audio/wav",
          "Content-Length": String(audio.size),
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline; filename=sochozara-gemini-narration.wav",
          "X-SochoZara-TTS-Provider": "Gemini",
        },
      });
    } catch (error) {
      geminiFailure = error;
    }
  }

  // Aura-2 English is the only non-Gemini fallback enabled here. It is only
  // called when the user has explicitly confirmed a Workers Free account.
  // The Workers Free daily cap is hard-enforced by Cloudflare; this app never
  // opts into paid overage and never calls this English model for other languages.
  if (language === "English" && credentials.cloudflareApiToken && credentials.cloudflareAccountId) {
    const result = await generateCloudflareEnglishNarration(
      script,
      credentials.cloudflareAccountId,
      credentials.cloudflareApiToken,
    );
    if (!result.ok) return result;
    return result;
  }

  if (geminiFailure) return providerError(geminiFailure);
  return jsonNoStore({
    error: language === "English"
      ? "No confirmed free narration provider is available. Confirm your Gemini Free Tier or connect Cloudflare Workers Free for English narration."
      : "Gemini Free Tier is required for this narration language. Cloudflare's automatic fallback is English-only; no paid voice provider was contacted.",
    code: "FREE_NARRATION_PROVIDER_NOT_CONFIGURED",
  }, 503);
}
