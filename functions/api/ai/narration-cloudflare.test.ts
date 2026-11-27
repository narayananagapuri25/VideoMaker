import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./narration-cloudflare";
import type { PagesContext } from "./_shared";

afterEach(() => vi.restoreAllMocks());

function makeContext(body: unknown, options: { provider?: string; freeUse?: boolean; language?: string } = {}): PagesContext {
  const request = new Request("https://studio.example/api/ai/narration-cloudflare", {
    method: "POST",
    headers: {
      Origin: "https://studio.example",
      "Content-Type": "application/json",
      "X-SochoZara-AI-Provider": options.provider ?? "cloudflare",
      ...(options.freeUse === false ? {} : { "X-SochoZara-Cloudflare-Free-Use": "true" }),
    },
    body: JSON.stringify({ script: "Welcome to this documentary. Let us explore the idea.", language: options.language ?? "English", ...body as object }),
  });
  return { request, env: { AI: { run: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } })) } } };
}

describe("Cloudflare Aura-1 narration", () => {
  it("generates MP3 narration through the selected Cloudflare binding only", async () => {
    const ctx = makeContext({});
    const run = vi.fn(async (_model: string, _inputs: Record<string, unknown>, _options?: { returnRawResponse?: boolean }) => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }));
    ctx.env.AI = { run };
    const response = await onRequestPost(ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toBe("@cf/deepgram/aura-1");
    expect(run.mock.calls[0][1]).toMatchObject({ text: "Welcome to this documentary. Let us explore the idea.", speaker: "luna", encoding: "mp3" });
    expect(run.mock.calls[0][2]).toEqual({ returnRawResponse: true });
  });

  it("blocks non-English narration instead of silently calling another provider", async () => {
    const ctx = makeContext({}, { language: "Telugu" });
    const run = vi.fn();
    ctx.env.AI = { run };
    const response = await onRequestPost(ctx);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "CLOUDFLARE_TTS_LANGUAGE_UNSUPPORTED" });
    expect(run).not.toHaveBeenCalled();
  });

  it("requires explicit free-tier consent and the Cloudflare provider selection", async () => {
    const noConsent = makeContext({}, { freeUse: false });
    const blocked = await onRequestPost(noConsent);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "CLOUDFLARE_FREE_PLAN_CONFIRMATION_REQUIRED" });

    const wrongProvider = makeContext({}, { provider: "gemini" });
    const rejected = await onRequestPost(wrongProvider);
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toMatchObject({ code: "SCENE_TTS_PROVIDER_MISMATCH" });
  });
});
