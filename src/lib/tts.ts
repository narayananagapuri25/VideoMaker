import type { Language } from "../types";
import { MAX_NARRATION_AUDIO_BYTES } from "./media-data";
import { getSelectedAIHeaders } from "./ai-selection";

interface TtsResponse {
  output_audio?: { data?: string; mime_type?: string };
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; data?: string; mime_type?: string }>;
  }>;
}

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_TRANSCRIPT_LENGTH = 26_000;

function decodeBase64Audio(encoded: string, mimeType: string): Blob {
  if (encoded.length > Math.ceil(MAX_NARRATION_AUDIO_BYTES * 4 / 3) + 4) {
    throw new Error("Generated narration is larger than 30 MB. Use a shorter script.");
  }
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("Gemini returned an invalid audio payload. Please retry.");
  }
  if (!binary.length) throw new Error("Gemini returned an empty audio file. Please retry.");
  if (binary.length > MAX_NARRATION_AUDIO_BYTES) {
    throw new Error("Generated narration is larger than 30 MB. Use a shorter script.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || "audio/wav" });
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Gemini voice generation timed out. Try a shorter script and generate again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function generateNarrationWithApiKey(
  script: string,
  apiKey: string,
  voice: string,
  language: Language,
): Promise<Blob> {
  const transcript = script.trim();
  if (!transcript) throw new Error("Add narration text before generating speech.");
  if (!apiKey.trim()) throw new Error("Enter your Gemini API key first.");
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error("This narration is too long for one request. Split it into shorter sections.");
  }

  const languageStyle = language === "Hinglish"
    ? "Natural Indian Hinglish pronunciation, fluid Hindi-English code-switching, clear Roman-script words, no exaggerated accent."
    : language === "Hindi"
      ? "Clear natural Hindi pronunciation with a warm Indian accent."
      : language === "Telugu"
        ? "Clear natural Telugu pronunciation with a warm, expressive delivery."
        : "Clear Indian English pronunciation with natural pacing.";

  const response = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim(),
    },
    body: JSON.stringify({
      model: "gemini-3.8-flash-tts",
      store: false,
      input: [{
        type: "user_input",
        content: [{
          type: "text",
          text: transcript,
          annotations: [{
            type: "speech_metadata",
            style: languageStyle + " Documentary narrator, warm and curious, cinematic but credible, medium pace, articulate every number clearly.",
          }],
        }],
      }],
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [{ voice }],
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 260);
    throw new Error("Gemini TTS request failed (" + response.status + "): " + detail);
  }
  let payload: TtsResponse;
  try {
    payload = await response.json() as TtsResponse;
  } catch {
    throw new Error("Gemini returned an unreadable voice response. Please retry.");
  }
  const audioParts = (payload.steps ?? [])
    .filter((step) => !step.type || step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "audio" && typeof part.data === "string");
  const selected = audioParts[audioParts.length - 1];
  const encoded = payload.output_audio?.data || selected?.data;
  if (!encoded) throw new Error("Gemini returned no audio. Check model access and try a shorter script.");
  const mimeType = payload.output_audio?.mime_type || selected?.mime_type || "audio/wav";
  if (!mimeType.startsWith("audio/")) throw new Error("Gemini returned an unsupported audio format.");
  const audio = decodeBase64Audio(encoded, mimeType);
  if (audio.size > MAX_NARRATION_AUDIO_BYTES) throw new Error("Generated narration is larger than 30 MB. Use a shorter script.");
  return audio;
}


export interface GeneratedNarration {
  blob: Blob;
  provider: string;
}

/** Requests narration from the same-origin free-only router. */
export async function generateNarration(
  script: string,
  voice: string,
  language: Language,
): Promise<GeneratedNarration> {
  const transcript = script.trim();
  if (!transcript) throw new Error("Add narration text before generating speech.");
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    throw new Error("This narration is too long for one request. Split it into shorter sections.");
  }
  const response = await fetch("/api/ai/narration", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg, audio/wav, application/json", ...getSelectedAIHeaders() },
    body: JSON.stringify({ script: transcript, voice, language }),
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "Gemini narration generation failed (HTTP " + response.status + ").";
    try {
      const payload: unknown = await response.json();
      if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Retain the HTTP status message for unreadable gateway responses.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("audio/") || !blob.size) {
    throw new Error("The secure Gemini service returned an empty or invalid audio file.");
  }
  if (blob.size > MAX_NARRATION_AUDIO_BYTES) {
    throw new Error("Generated narration is larger than 30 MB. Use a shorter script.");
  }
  return {
    blob,
    provider: response.headers.get("X-SochoZara-TTS-Provider") || "AI Voice",
  };
}
