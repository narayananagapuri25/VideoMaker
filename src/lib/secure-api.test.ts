import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as generateStory } from "../../functions/api/ai/story";
import { onRequestPost as generateNarration } from "../../functions/api/ai/narration";
import { onRequestPost as generateSceneImage } from "../../functions/api/ai/scene-image";
import { onRequestGet as getStatus } from "../../functions/api/ai/status";
import type { PagesContext } from "../../functions/api/ai/_shared";

afterEach(() => vi.restoreAllMocks());

function context(
  path: string,
  body?: unknown,
  key?: string,
  origin = "https://studio.example",
  sessionKey?: string,
): PagesContext {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (body !== undefined) headers.set("Origin", origin);
  if (sessionKey) headers.set("X-SochoZara-Gemini-Key", sessionKey);
  if ((key || sessionKey) && (path.endsWith("/story") || path.endsWith("/narration"))) {
    headers.set("X-SochoZara-AI-Provider", "gemini");
    headers.set("X-SochoZara-Gemini-Free-Use", "true");
  }
  return {
    request: new Request("https://studio.example" + path, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env: key ? { GEMINI_API_KEY: key } : {},
  };
}

describe("Cloudflare secure Gemini endpoints", () => {
  it("reports whether an encrypted server key is configured without returning its value", async () => {
    const missing = await getStatus(context("/api/ai/status"));
    const missingPayload = await missing.json() as { configured: boolean };
    expect(missingPayload.configured).toBe(false);

    const configured = await getStatus(context("/api/ai/status", undefined, "server-only-test-secret"));
    const configuredPayload = await configured.json() as { configured: boolean; storage: string; serverSecretConfigured: boolean };
    expect(configuredPayload.configured).toBe(true);
    expect(configuredPayload.storage).toContain("Cloudflare");
    expect(configuredPayload.serverSecretConfigured).toBe(true);
    expect(JSON.stringify(configuredPayload)).not.toContain("server-only-test-secret");
  });

  it("reports a key supplied in the current tab without returning the credential", async () => {
    const response = await getStatus(context("/api/ai/status", undefined, undefined, "https://studio.example", "tab-only-test-secret"));
    const payload = await response.json() as { configured: boolean; source: string; storage: string };
    expect(payload.configured).toBe(true);
    expect(payload.source).toBe("tab-session");
    expect(payload.storage).toContain("tab session");
    expect(JSON.stringify(payload)).not.toContain("tab-only-test-secret");
  });

  it("returns an actionable setup error when no AI provider is configured", async () => {
    const response = await generateStory(context("/api/ai/story", {
      topic: "How does the stock market work?",
      language: "English",
      targetDuration: 60,
      aspectRatio: "9:16",
    }));
    expect(response.status).toBe(400);
    const payload = await response.json() as { error: string; code: string };
    expect(payload.code).toBe("AI_PROVIDER_REQUIRED");
    expect(payload.error).toContain("Choose and save one AI provider");
  });

  it("rejects cross-origin browser requests", async () => {
    const response = await generateStory(context("/api/ai/story", {
      topic: "A safe test topic",
      language: "English",
      targetDuration: 30,
      aspectRatio: "9:16",
    }, "server-only-test-secret", "https://attacker.example"));
    expect(response.status).toBe(403);
  });

  it("uses the server secret for story generation and never returns it to the browser", async () => {
    const story = {
      title: "A server generated story",
      script: "A short explanation.",
      editorialNote: "",
      scenes: [
        { title: "One", narration: "One.", caption: "One", visualPrompt: "A scene", visualPlan: { layout: "hero", subject: "A scene", headline: "One", labels: [], steps: [], values: [], trend: "flat", note: "" }, duration: 5 },
        { title: "Two", narration: "Two.", caption: "Two", visualPrompt: "Another scene", visualPlan: { layout: "process", subject: "A process", headline: "Two", labels: [], steps: ["Start", "Finish"], values: [], trend: "flat", note: "" }, duration: 5 },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(story) }] }],
      status: "completed",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await generateStory(context("/api/ai/story", {
      topic: "How does the stock market work?",
      language: "English",
      targetDuration: 60,
      aspectRatio: "9:16",
    }, "server-only-test-secret"));
    expect(response.status).toBe(200);
    const payload = await response.json() as { story: { title: string } };
    expect(payload.story.title).toBe(story.title);
    expect(JSON.stringify(payload)).not.toContain("server-only-test-secret");
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("server-only-test-secret");
  });

  it("uses only the selected Cloudflare Workers AI binding for story generation", async () => {
    const story = {
      title: "Cloudflare storyboard",
      script: "A short explanation.",
      scenes: [
        { title: "One", narration: "One.", caption: "One", visualPrompt: "A scene", duration: 5 },
        { title: "Two", narration: "Two.", caption: "Two", visualPrompt: "Another scene", duration: 5 },
      ],
    };
    const run = vi.fn(async () => ({ response: JSON.stringify(story) }));
    const ctx = context("/api/ai/story", { topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16" });
    ctx.request = new Request(ctx.request.url, {
      method: "POST",
      headers: {
        Origin: "https://studio.example",
        "Content-Type": "application/json",
        "X-SochoZara-AI-Provider": "cloudflare",
        "X-SochoZara-Cloudflare-Free-Use": "true",
      },
      body: JSON.stringify({ topic: "A test topic", language: "English", targetDuration: 30, aspectRatio: "9:16" }),
    });
    ctx.env = { AI: { run }, GEMINI_API_KEY: "must-not-be-used" };

    const response = await generateStory(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json() as { story: { title: string }; source: string };
    expect(payload.story.title).toBe(story.title);
    expect(payload.source).toBe("cloudflare");
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toBe("@cf/google/gemma-4-26b-a4b-it");
  });

  it("generates FLUX scene images only through the explicitly selected Cloudflare binding", async () => {
    const run = vi.fn(async () => ({ image: "AQID" }));
    const ctx = context("/api/ai/scene-image", { prompt: "Cinematic documentary still image" });
    ctx.request = new Request(ctx.request.url, {
      method: "POST",
      headers: {
        Origin: "https://studio.example",
        "Content-Type": "application/json",
        "X-SochoZara-AI-Provider": "cloudflare",
        "X-SochoZara-Cloudflare-Free-Use": "true",
      },
      body: JSON.stringify({ prompt: "Cinematic documentary still image" }),
    });
    ctx.env = { AI: { run } };

    const response = await generateSceneImage(ctx);
    expect(response.status).toBe(200);
    const payload = await response.json() as { imageDataUrl: string; model: string };
    expect(payload.imageDataUrl).toBe("data:image/jpeg;charset=utf-8;base64,AQID");
    expect(payload.model).toBe("@cf/black-forest-labs/flux-1-schnell");
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][1]).toMatchObject({ steps: 8, prompt: "Cinematic documentary still image" });
  });
  it("does not use Cloudflare Workers AI as an automatic story fallback", async () => {
    const story = {
      title: "A binding-generated story",
      script: "A short explanation.",
      editorialNote: "",
      scenes: [
        { title: "One", narration: "One.", caption: "One", visualPrompt: "A scene", duration: 5 },
        { title: "Two", narration: "Two.", caption: "Two", visualPrompt: "Another scene", duration: 5 },
      ],
    };
    const run = vi.fn(async () => ({ response: JSON.stringify(story) }));
    const ctx = context("/api/ai/story", {
      topic: "How does the stock market work?",
      language: "English",
      targetDuration: 30,
      aspectRatio: "9:16",
    });
    ctx.request = new Request(ctx.request.url, {
      method: "POST",
      headers: {
        Origin: "https://studio.example",
        "Content-Type": "application/json",
        "X-SochoZara-Cloudflare-Free-Use": "true",
      },
      body: JSON.stringify({
        topic: "How does the stock market work?",
        language: "English",
        targetDuration: 30,
        aspectRatio: "9:16",
      }),
    });
    ctx.env = { AI: { run } };

    const response = await generateStory(ctx);
    expect(response.status).toBe(400);
    const payload = await response.json() as { code: string };
    expect(payload.code).toBe("AI_PROVIDER_REQUIRED");
    expect(run).not.toHaveBeenCalled();
  });

  it("uses the per-tab key for story generation when no Cloudflare secret exists", async () => {
    const story = {
      title: "A tab-key story",
      script: "A short explanation.",
      scenes: [
        { title: "One", narration: "One.", caption: "One", visualPrompt: "A scene", duration: 5 },
        { title: "Two", narration: "Two.", caption: "Two", visualPrompt: "Another scene", duration: 5 },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(story) }] }],
      status: "completed",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await generateStory(context("/api/ai/story", {
      topic: "A test topic",
      language: "English",
      targetDuration: 30,
      aspectRatio: "9:16",
    }, undefined, "https://studio.example", "tab-only-test-secret"));
    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("tab-only-test-secret");
  });

  it("does not use Cloudflare Workers AI as an automatic narration fallback", async () => {
    const audioStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const run = vi.fn(async () => audioStream);
    const ctx = context("/api/ai/narration", {
      script: "A short English narration.",
      voice: "Kore",
      language: "English",
    });
    ctx.request = new Request(ctx.request.url, {
      method: "POST",
      headers: {
        Origin: "https://studio.example",
        "Content-Type": "application/json",
        "X-SochoZara-Cloudflare-Free-Use": "true",
      },
      body: JSON.stringify({
        script: "A short English narration.",
        voice: "Kore",
        language: "English",
      }),
    });
    ctx.env = { AI: { run } };

    const response = await generateNarration(ctx);
    expect(response.status).toBe(501);
    const payload = await response.json() as { code: string };
    expect(payload.code).toBe("SELECTED_PROVIDER_TTS_UNAVAILABLE");
    expect(run).not.toHaveBeenCalled();
  });

  it("uses the per-tab key for narration when no Cloudflare secret exists", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "audio", data: "AQID", mime_type: "audio/wav" }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await generateNarration(context("/api/ai/narration", {
      script: "A short test narration.",
      voice: "Kore",
      language: "English",
    }, undefined, "https://studio.example", "tab-only-test-secret"));
    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("tab-only-test-secret");
  });

  it("returns narration audio bytes while keeping the server key out of the response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      steps: [{ type: "model_output", content: [{ type: "audio", data: "AQID", mime_type: "audio/wav" }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await generateNarration(context("/api/ai/narration", {
      script: "A short test narration.",
      voice: "Kore",
      language: "English",
    }, "server-only-test-secret"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("audio/wav");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("server-only-test-secret");
  });
});
