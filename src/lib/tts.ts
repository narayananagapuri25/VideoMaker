import type { Language } from "../types";
import { MAX_NARRATION_AUDIO_BYTES } from "./media-data";
import { getSelectedAIHeaders } from "./ai-selection";

interface TtsResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_TRANSCRIPT_LENGTH = 26_000;
const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";

function pcmToWav(pcm: Uint8Array, sampleRate = 24_000, channels = 1): Blob {
  if (pcm.byteLength % 2 !== 0) throw new Error("Gemini returned an incomplete PCM audio frame.");
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  const byteRate = sampleRate * channels * 2;
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], { type: "audio/wav" });
}

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
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (/audio\/(pcm|l16)/i.test(mimeType)) return pcmToWav(bytes);
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
    ? "Natural Indian Hinglish pronunciation with fluent Hindi-English code-switching and clear Indian pronunciation."
    : language === "Hindi"
      ? "Clear, natural Hindi pronunciation with a warm Indian narrator delivery."
      : language === "Telugu"
        ? "Clear, natural Telugu pronunciation with a warm, expressive narrator delivery."
        : "Clear Indian English pronunciation with natural pacing.";

  const response = await fetchWithTimeout(
    "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_TTS_MODEL + ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey.trim(),
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: transcript,
            speechMetadata: {
              style: languageStyle + " Professional documentary voice-over, warm and curious, confident but credible, medium pace, articulate every number clearly. Read only the supplied narration verbatim.",
            },
          }],
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { voice },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error("Gemini TTS request failed (" + response.status + "): " + detail);
  }
  let payload: TtsResponse;
  try {
    payload = await response.json() as TtsResponse;
  } catch {
    throw new Error("Gemini returned an unreadable voice response. Please retry.");
  }
  const audioParts = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const selected = audioParts.find((part) => typeof part.inlineData?.data === "string" && part.inlineData.data.length > 0);
  const encoded = selected?.inlineData?.data;
  if (!encoded) {
    const detail = payload.error?.message;
    throw new Error(detail || "Gemini returned no audio. Check the Free Tier quota, model access and language, then retry.");
  }
  const mimeType = selected.inlineData?.mimeType || "audio/wav";
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
