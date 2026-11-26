import { afterEach, describe, expect, it, vi } from "vitest";
import { generateNarration } from "./tts";

afterEach(() => vi.restoreAllMocks());

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

    const audio = await generateNarration("Namaste duniya", "test-api-key", "Kore", "Hinglish");

    expect(audio.type).toBe("audio/wav");
    expect(audio.size).toBe(3);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const request = JSON.parse(String(init?.body));
    expect(request.model).toBe("gemini-3.8-flash-tts");
    expect(request.store).toBe(false);
    expect(request.response_format).toEqual({ type: "audio" });
    expect(request.generation_config.speech_config).toEqual([{ voice: "Kore" }]);
  });

  it("rejects an empty script before sending a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(generateNarration("  ", "test-api-key", "Kore", "Hinglish"))
      .rejects.toThrow("Add narration text before generating speech.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
