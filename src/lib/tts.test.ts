import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectAIProvider } from "./ai-selection";

beforeEach(() => selectAIProvider("gemini"));
import { generateNarration, generateNarrationWithApiKey } from "./tts";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Gemini narration", () => {
  it("uses a stateless TTS interaction and extracts returned WAV audio", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        steps: [{
          type: "model_output",
          content: [{ type: "audio", data: "AQID", mime_type: "audio/wav" }],
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const audio = await generateNarrationWithApiKey("Hello world", "test-api-key", "Kore", "English");

    expect(audio.type).toBe("audio/wav");
    expect(audio.size).toBe(3);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const request = JSON.parse(String(init?.body));
    expect(request.model).toBe("gemini-3.8-flash-tts");
    expect(request.store).toBe(false);
    expect(request.response_format).toEqual({ type: "audio" });
    expect(request.generation_config.speech_config).toEqual([{ voice: "Kore" }]);
    expect(request.input[0].content[0].text).toBe("Hello world");
    expect(request.input[0].content[0].annotations[0].style).toContain("Indian English pronunciation");
    expect(request.input[0].content[0].annotations[0].style).toContain("Documentary narrator");
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
      output_audio: { data: "not@base64", mime_type: "audio/wav" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(generateNarrationWithApiKey("Some narration", "test-api-key", "Kore", "English"))
      .rejects.toThrow(/invalid audio payload/i);
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
