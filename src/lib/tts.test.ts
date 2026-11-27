import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectAIProvider } from "./ai-selection";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  });
  selectAIProvider("gemini");
});
import { generateNarration, generateNarrationWithApiKey } from "./tts";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Gemini narration", () => {
  it("uses the supported GenerateContent TTS API and extracts WAV audio", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: "AQID", mimeType: "audio/wav" } }],
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const audio = await generateNarrationWithApiKey("Hello world", "test-api-key", "Kore", "English");

    expect(audio.type).toBe("audio/wav");
    expect(audio.size).toBe(3);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-api-key");
    const request = JSON.parse(String(init?.body));
    expect(request.contents[0].parts[0].text).toBe("Hello world");
    expect(request.contents[0].parts[0].speechMetadata.style).toContain("Indian English pronunciation");
    expect(request.contents[0].parts[0].speechMetadata.style).toContain("Professional documentary voice-over");
    expect(request.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(request.generationConfig.speechConfig.voiceConfig.voice).toBe("Kore");
  });

  it("wraps raw 24 kHz PCM responses in a valid WAV container", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: "AQIDBA==", mimeType: "audio/pcm" } }],
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const audio = await generateNarrationWithApiKey("Hello world", "test-api-key", "Kore", "English");
    expect(audio.type).toBe("audio/wav");
    const bytes = new Uint8Array(await audio.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(24_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requests narration from the secure same-origin endpoint without a browser API key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/wav" },
    }));
    const narration = await generateNarration("Hello from SochoZara", "Kore", "English");
    expect(narration.blob.type).toBe("audio/wav");
    expect(narration.blob.size).toBe(3);
    expect(narration.provider).toBe("AI Voice");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/narration");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({ script: "Hello from SochoZara", voice: "Kore", language: "English" });
  });

  it("attaches the saved tab-session key to the same-origin narration request", async () => {
    const storage = new Map<string, string>([["sochozara.gemini.api-key", "tab-session-tts-key"]]);
    vi.stubGlobal("sessionStorage", {
      getItem: (name: string) => storage.get(name) ?? null,
      setItem: (name: string, value: string) => { storage.set(name, value); },
      removeItem: (name: string) => { storage.delete(name); },
    });
    selectAIProvider("gemini");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/wav" },
    }));
    await generateNarration("Session narration", "Kore", "English");
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("x-sochozara-gemini-key")).toBe("tab-session-tts-key");
  });

  it("rejects invalid base64 audio returned by the provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ inlineData: { data: "not@base64", mimeType: "audio/wav" } }] },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(generateNarrationWithApiKey("Some narration", "test-api-key", "Kore", "English"))
      .rejects.toThrow(/invalid audio payload/i);
  });

  it("rejects an empty audio response rather than creating a silent track", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "No audio" }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(generateNarrationWithApiKey("Some narration", "test-api-key", "Kore", "English"))
      .rejects.toThrow(/returned no audio/i);
  });

  it("rejects overlong transcripts before sending a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(generateNarrationWithApiKey("x".repeat(26_001), "test-api-key", "Kore", "English"))
      .rejects.toThrow(/too long/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty script before sending a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(generateNarrationWithApiKey("  ", "test-api-key", "Kore", "Hinglish"))
      .rejects.toThrow("Add narration text before generating speech.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
