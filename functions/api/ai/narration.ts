import { generateNarrationWithApiKey } from "../../../src/lib/tts";
import { checkSameOrigin, jsonNoStore, parseJsonBody, providerError, requireGeminiKey, type PagesContext } from "./_shared";
import type { Language } from "../../../src/types";

const languages: Language[] = ["English", "Hinglish", "Hindi", "Telugu"];
const voices = ["Kore", "Aoede", "Puck", "Charon", "Fenrir", "Zephyr"];

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const apiKey = requireGeminiKey(env);
  if (apiKey instanceof Response) return apiKey;
  const body = await parseJsonBody(request, 40_000);
  if (body instanceof Response) return body;

  const script = typeof body.script === "string" ? body.script.trim() : "";
  const voice = typeof body.voice === "string" ? body.voice : "Kore";
  const language = typeof body.language === "string" ? body.language : "English";
  if (!script || script.length > 26_000) {
    return jsonNoStore({ error: "Enter narration between 1 and 26,000 characters." }, 400);
  }
  if (!voices.includes(voice)) {
    return jsonNoStore({ error: "Choose a supported Gemini narrator voice." }, 400);
  }
  if (!languages.includes(language as Language)) {
    return jsonNoStore({ error: "Choose a supported narration language." }, 400);
  }

  try {
    const audio = await generateNarrationWithApiKey(script, apiKey, voice, language as Language);
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": audio.type || "audio/wav",
        "Content-Length": String(audio.size),
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline; filename=sochozara-narration.wav",
      },
    });
  } catch (error) {
    return providerError(error);
  }
}
