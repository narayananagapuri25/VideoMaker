import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as generateStory } from "../../functions/api/ai/story";
import { onRequestPost as generateNarration } from "../../functions/api/ai/narration";
import { onRequestGet as getStatus } from "../../functions/api/ai/status";
import type { PagesContext } from "../../functions/api/ai/_shared";

afterEach(() => vi.restoreAllMocks());

function context(path: string, body?: unknown, key?: string, origin = "https://studio.example") : PagesContext {
  return {
    request: new Request("https://studio.example" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : {
        "Content-Type": "application/json",
        Origin: origin,
      },
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
    const configuredPayload = await configured.json() as { configured: boolean; storage: string };
    expect(configuredPayload.configured).toBe(true);
    expect(configuredPayload.storage).toContain("Cloudflare");
    expect(JSON.stringify(configuredPayload)).not.toContain("server-only-test-secret");
  });

  it("returns an actionable setup error when the Gemini secret is absent", async () => {
    const response = await generateStory(context("/api/ai/story", {
      topic: "How does the stock market work?",
      language: "English",
      targetDuration: 60,
      aspectRatio: "9:16",
    }));
    expect(response.status).toBe(503);
    const payload = await response.json() as { error: string; code: string };
    expect(payload.code).toBe("GEMINI_NOT_CONFIGURED");
    expect(payload.error).toContain("GEMINI_API_KEY");
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
