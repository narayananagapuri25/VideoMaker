import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStory } from "./ai";

afterEach(() => vi.restoreAllMocks());

const storyResponse = {
  title: "A test story",
  script: "A complete short narration.",
  editorialNote: "Verify the cited measurement before publishing.",
  scenes: [
    { title: "Opening", narration: "Start here.", caption: "Start", visualPrompt: "A cinematic opening.", duration: 6 },
    { title: "Reveal", narration: "Explain the point.", caption: "The point", visualPrompt: "A clear infographic.", duration: 8 },
  ],
};

describe("AI story generation", () => {
  it("uses the offline story path without sending a network request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await generateStory({
      topic: "Why do we see lightning before thunder?",
      language: "Hinglish",
      targetDuration: 45,
      aspectRatio: "9:16",
    });
    expect(result.source).toBe("local");
    expect(result.story.scenes.length).toBeGreaterThan(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates Gemini JSON, scenes and editorial caveats", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(storyResponse) }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateStory({
      topic: "A test topic",
      language: "English",
      targetDuration: 30,
      aspectRatio: "16:9",
      apiKey: "example-key",
    });
    expect(result.source).toBe("gemini");
    expect(result.story.title).toBe("A test story");
    expect(result.story.editorialNote).toContain("Verify");
    expect(result.story.scenes).toHaveLength(2);
  });

  it("rejects malformed, empty or excessive AI story output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ...storyResponse, scenes: [] }) }] } }],
    }), { status: 200 }));
    await expect(generateStory({
      topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/complete storyboard/i);
  });

  it("surfaces provider errors without silently creating an offline story", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    await expect(generateStory({
      topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/429/);
  });

  it("rejects empty and oversized topics before any network request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(generateStory({
      topic: " ", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/enter a topic/i);
    await expect(generateStory({
      topic: "x".repeat(2_001), language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/2,000 characters/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
