import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./narration-cloudflare";
import type { PagesContext } from "./_shared";

afterEach(() => vi.restoreAllMocks());

function makeContext(options: { language?: string; provider?: string; consent?: boolean } = {}): { context: PagesContext; run: ReturnType<typeof vi.fn> } {
  const request = new Request("https://studio.example/api/ai/narration-cloudflare", {
    method: "POST",
    headers: {
      Origin: "https://studio.example",
      "Content-Type": "application/json",
      "X-SochoZara-AI-Provider": options.provider ?? "cloudflare",
      ...(options.consent === false ? {} : { "X-SochoZara-Cloudflare-Free-Use": "true" }),
    },
    body: JSON.stringify({ script: "Welcome to this documentary. Let us explore the idea.", language: options.language ?? "English" }),
  });
  const run = vi.fn(async (_model: string, _inputs: Record<string, unknown>, _options?: { returnRawResponse?: boolean; rejectIfBusy?: boolean }) =>
    new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }),
  );
  return { context: { request, env: { AI: { run } } }, run };
}

describe("Cloudflare Aura-1 narration", () => {
  it("generates MP3 narration through the selected Cloudflare binding", async () => {
    const { context, run } = makeContext();
    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toBe("@cf/deepgram/aura-1");
    expect(run.mock.calls[0][1]).toMatchObject({ text: "Welcome to this documentary. Let us explore the idea.", speaker: "luna", encoding: "mp3" });
    expect(run.mock.calls[0][2]).toEqual({ returnRawResponse: true, rejectIfBusy: true });
  });

  it("rejects non-English narration instead of calling a different provider", async () => {
    const { context, run } = makeContext({ language: "Telugu" });
    const response = await onRequestPost(context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "CLOUDFLARE_TTS_LANGUAGE_UNSUPPORTED" });
    expect(run).not.toHaveBeenCalled();
  });

  it("requires explicit Free use confirmation and the Cloudflare provider selection", async () => {
    const noConsent = makeContext({ consent: false });
    const blocked = await onRequestPost(noConsent.context);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "CLOUDFLARE_FREE_PLAN_CONFIRMATION_REQUIRED" });

    const wrongProvider = makeContext({ provider: "gemini" });
    const rejected = await onRequestPost(wrongProvider.context);
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toMatchObject({ code: "SCENE_TTS_PROVIDER_MISMATCH" });
  });
});
