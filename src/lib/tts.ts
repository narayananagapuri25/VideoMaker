import type { Language } from "../types";

interface TtsResponse {
  output_audio?: { data?: string; mime_type?: string };
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; data?: string; mime_type?: string }>;
  }>;
}

function decodeBase64Audio(encoded: string, mimeType: string): Blob {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || "audio/wav" });
}

export async function generateNarration(
  script: string,
  apiKey: string,
  voice: string,
  language: Language,
): Promise<Blob> {
  const transcript = script.trim();
  if (!transcript) throw new Error("Add narration text before generating speech.");
  if (!apiKey.trim()) throw new Error("Enter your Gemini API key first.");
  if (transcript.length > 26000) {
    throw new Error("This narration is too long for one request. Split it into shorter sections.");
  }

  const languageStyle = language === "Hinglish"
    ? "Natural Indian Hinglish pronunciation, fluid Hindi-English code-switching, clear Roman-script words, no exaggerated accent."
    : language === "Hindi"
      ? "Clear natural Hindi pronunciation with a warm Indian accent."
      : language === "Telugu"
        ? "Clear natural Telugu pronunciation with a warm, expressive delivery."
        : "Clear Indian English pronunciation with natural pacing.";

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim(),
    },
    body: JSON.stringify({
      model: "gemini-3.8-flash-tts",
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
    const detail = await response.text();
    throw new Error("Gemini TTS request failed (" + response.status + "): " + detail.slice(0, 260));
  }
  const payload = await response.json() as TtsResponse;
  const audioParts = (payload.steps ?? [])
    .filter((step) => !step.type || step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "audio" && typeof part.data === "string");
  const selected = audioParts[audioParts.length - 1];
  const encoded = payload.output_audio?.data || selected?.data;
  if (!encoded) throw new Error("Gemini returned no audio. Check model access and try a shorter script.");
  return decodeBase64Audio(encoded, payload.output_audio?.mime_type || selected?.mime_type || "audio/wav");
}