import { afterEach, describe, expect, it, vi } from "vitest";
import { selectAIProvider } from "./ai-selection";
import { generateStory, generateStoryWithApiKey, testGeminiConnection, testGeminiConnectionWithApiKey } from "./ai";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const storyResponse = {
  title: "A test story",
  script: "A complete short narration.",
  editorialNote: "Verify the cited measurement before publishing.",
  scenes: [
    { title: "Opening", narration: "Start here.", caption: "Start", visualPrompt: "A cinematic opening.", visualPlan: { layout: "hero", subject: "The main concept", headline: "Opening", labels: ["One idea"], steps: [], values: [], trend: "flat", note: "" }, duration: 6 },
    { title: "Reveal", narration: "Explain the point.", caption: "The point", visualPrompt: "A clear infographic.", visualPlan: { layout: "process", subject: "The process", headline: "How it works", labels: ["Input", "Output"], steps: ["Step one", "Step two"], values: [], trend: "flat", note: "" }, duration: 8 },
  ],
};

function interactionResponse(story: unknown) {
  return {
    steps: [{
      type: "model_output",
      content: [{ type: "text", text: JSON.stringify(story) }],
    }],
    status: "completed",
  };
}

describe("Gemini connection diagnostics", () => {
  it("checks model and key access with a stateless minimal request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      steps: [{
        type: "model_output",
        content: [{ type: "text", text: "SOCHOZARA_GEMINI_OK" }],
      }],
      status: "completed",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await testGeminiConnectionWithApiKey(" sample-api-key ");

    expect(result).toContain("Gemini connection successful");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("sample-api-key");
    const request = JSON.parse(String(init?.body));
    expect(request.model).toBe("gemini-4-hydrogen");
    expect(request.store).toBe(false);
    expect(request.input).toContain("SOCHOZARA_GEMINI_OK");
  });

  it("checks Gemini through the same-origin secure endpoint without sending a key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      message: "Secure server connection successful.",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const message = await testGeminiConnection();
    expect(message).toContain("Secure server connection successful");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/connection");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBeNull();
  });

  it("sends the saved tab-session key only to the same-origin story and connection routes", async () => {
    const storage = new Map<string, string>([["sochozara.gemini.api-key", "tab-session-test-key"]]);
    vi.stubGlobal("sessionStorage", {
      getItem: (name: string) => storage.get(name) ?? null,
      setItem: (name: string, value: string) => { storage.set(name, value); },
      removeItem: (name: string) => { storage.delete(name); },
    });
    selectAIProvider("gemini");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return url.endsWith("/connection")
        ? new Response(JSON.stringify({ message: "Gemini connection successful." }), { status: 200, headers: { "Content-Type": "application/json" } })
        : new Response(JSON.stringify({ story: storyResponse, source: "gemini" }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    await testGeminiConnection();
    await generateStory({
      topic: "A test topic",
      language: "English",
      targetDuration: 30,
      aspectRatio: "9:16",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("x-sochozara-gemini-key")).toBe("tab-session-test-key");
    }
  });

  it("requires a key without making a network request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(testGeminiConnectionWithApiKey("  ")).rejects.toThrow(/paste your google ai studio api key/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains quota errors from the model access check", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: 429, message: "Quota exceeded." },
    }), { status: 429 }));
    await expect(testGeminiConnectionWithApiKey("sample-api-key")).rejects.toThrow(/quota or rate limit reached.*429/i);
  });
});

describe("AI story generation", () => {
  it("sends story generation to the secure same-origin endpoint without a browser API key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      story: storyResponse,
      source: "gemini",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await generateStory({
      topic: "How does the stock market work?",
      language: "English",
      targetDuration: 60,
      aspectRatio: "9:16",
    });
    expect(result.source).toBe("gemini");
    expect(result.story.title).toBe("A test story");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/story");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBeNull();
    expect(String(init?.body)).not.toContain("apiKey");
    expect(JSON.parse(String(init?.body))).toMatchObject({ topic: "How does the stock market work?", targetDuration: 60 });
  });

  it("uses the current stateless Gemini Interactions API and validates its structured JSON response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(interactionResponse(storyResponse)),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const result = await generateStoryWithApiKey({
      topic: "A test topic",
      language: "English",
      targetDuration: 30,
      aspectRatio: "16:9",
      apiKey: " example-key ",
    });

    expect(result.source).toBe("gemini");
    expect(result.story.title).toBe("A test story");
    expect(result.story.editorialNote).toContain("Verify");
    expect(result.story.scenes).toHaveLength(2);
    expect(result.story.scenes[0].visualPlan?.layout).toBe("hero");
    expect(result.story.scenes[1].visualPlan?.steps).toEqual(["Step one", "Step two"]);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("example-key");
    expect(new Headers(init?.headers).get("Api-Revision")).toBe("2026-05-20");
    const request = JSON.parse(String(init?.body));
    expect(request.model).toBe("gemini-4-hydrogen");
    expect(request.store).toBe(false);
    expect(request.input).toContain("A test topic");
    expect(request.response_format).toMatchObject({ type: "text", mime_type: "application/json" });
    expect(request.response_format.schema.required).toEqual(["title", "script", "editorialNote", "scenes"]);
    expect(request.response_format.schema.properties.scenes.items.required).toContain("visualPlan");
  });

  it("supports multiple text blocks in the model output", async () => {
    const parts = JSON.stringify(storyResponse);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      steps: [{
        type: "model_output",
        content: [
          { type: "text", text: parts.slice(0, 20) },
          { type: "text", text: parts.slice(20) },
        ],
      }],
    }), { status: 200 }));

    const result = await generateStoryWithApiKey({
      topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    });
    expect(result.story.title).toBe("A test story");
  });

  it("rejects malformed, empty or excessive AI story output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(
      interactionResponse({ ...storyResponse, scenes: [] }),
    ), { status: 200 }));
    await expect(generateStoryWithApiKey({
      topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/complete storyboard/i);
  });

  it("surfaces actionable provider errors without silently creating an offline story", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: 429, message: "Resource exhausted. Quota exceeded." },
    }), { status: 429, headers: { "Content-Type": "application/json" } }));
    await expect(generateStoryWithApiKey({
      topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/quota or rate limit reached \(429\).*Quota exceeded/i);
  });

  it("explains API key authentication failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { code: 401, message: "API key not valid." },
    }), { status: 401, headers: { "Content-Type": "application/json" } }));
    await expect(generateStoryWithApiKey({
      topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/rejected the API key \(401\)/i);
  });

  it("rejects a completed interaction without model text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      steps: [], status: "completed",
    }), { status: 200 }));
    await expect(generateStoryWithApiKey({
      topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/without returning story text/i);
  });

  it("rejects empty and oversized topics before any network request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(generateStoryWithApiKey({
      topic: " ", language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/enter a topic/i);
    await expect(generateStoryWithApiKey({
      topic: "x".repeat(2_001), language: "English", targetDuration: 30, aspectRatio: "9:16", apiKey: "example-key",
    })).rejects.toThrow(/2,000 characters/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
