import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as getConnection } from "../../functions/api/video/magic-hour/connection";
import { onRequestPost as generateVideo } from "../../functions/api/video/magic-hour/generate";

afterEach(() => vi.restoreAllMocks());

function request(
  path: string,
  body?: unknown,
  options: { key?: string; freeUse?: boolean; origin?: string } = {},
): Request {
  const headers = new Headers();
  headers.set("Origin", options.origin ?? "https://studio.example");
  if (options.key) headers.set("X-SochoZara-Magic-Hour-Key", options.key);
  if (options.freeUse) headers.set("X-SochoZara-Magic-Hour-Free-Use", "true");
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request("https://studio.example" + path, {
    method: body === undefined ? "POST" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function account(tier = "free", credits = 240, subscription: unknown = null) {
  return { id: "account-test", email: "test@example.com", tier, credits, subscription };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const videoRequest = {
  prompt: "A documentary shot of Earth rotating in space, slow orbital camera move",
  seconds: 5,
  aspectRatio: "9:16",
  model: "ltx-2.5",
};

describe("Magic Hour free-tier video guardrails", () => {
  it("checks the live Magic Hour account and reports the verified Free-tier models", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(account()));
    const result = await getConnection({
      request: request("/api/video/magic-hour/connection", undefined, { key: "magic-test-key" }),
    });
    expect(result.status).toBe(200);
    const payload = await result.json() as {
      freeTier: boolean;
      credits: number;
      preferredModel: string;
      freeModelAccess: string[];
      estimatedFiveSecondClipCredits: number;
    };
    expect(payload).toMatchObject({
      freeTier: true,
      credits: 240,
      preferredModel: "ltx-2.5",
      freeModelAccess: ["ltx-2.5", "minimax-h3"],
      estimatedFiveSecondClipCredits: 120,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.magichour.ai/v1/account");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer magic-test-key");
  });

  it("refuses to submit a video until the free-credit-only attestation is present", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await generateVideo({
      request: request("/api/video/magic-hour/generate", videoRequest, { key: "magic-test-key" }),
    });
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: "FREE_CREDITS_CONFIRMATION_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks subscriptions and non-Free accounts before submitting any video job", async () => {
    const cases = [
      { tier: "creator", subscription: { name: "Creator", status: "active" } },
      { tier: "free", subscription: { name: "Creator", status: "past_due" } },
    ];
    for (const item of cases) {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        response(account(item.tier, 5_000, item.subscription)),
      );
      const result = await generateVideo({
        request: request("/api/video/magic-hour/generate", videoRequest, {
          key: "magic-test-key",
          freeUse: true,
        }),
      });
      expect(result.status).toBe(403);
      expect(await result.json()).toMatchObject({ code: "FREE_TIER_ACCOUNT_REQUIRED" });
      expect(fetchMock).toHaveBeenCalledOnce();
      vi.restoreAllMocks();
    }
  });

  it("does not queue a clip when the available Free balance is too low", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(account("free", 119)));
    const result = await generateVideo({
      request: request("/api/video/magic-hour/generate", videoRequest, {
        key: "magic-test-key",
        freeUse: true,
      }),
    });
    expect(result.status).toBe(402);
    expect(await result.json()).toMatchObject({
      code: "INSUFFICIENT_FREE_CREDITS",
      credits: 119,
      requiredCredits: 120,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("submits only the explicitly selected free LTX-2.5 model at 480p", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(account("free", 240)))
      .mockResolvedValueOnce(response({ id: "cuid-test-video-123", credits_charged: 120 }));
    const result = await generateVideo({
      request: request("/api/video/magic-hour/generate", videoRequest, {
        key: "magic-test-key",
        freeUse: true,
      }),
    });
    expect(result.status).toBe(202);
    expect(await result.json()).toMatchObject({
      id: "cuid-test-video-123",
      model: "ltx-2.5",
      resolution: "480p",
      requestedSeconds: 5,
      creditsCharged: 120,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.magichour.ai/v1/text-to-video");
    const job = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(job).toMatchObject({
      end_seconds: 5,
      aspect_ratio: "9:16",
      model: "ltx-2.5",
      resolution: "480p",
      audio: true,
      style: { prompt: videoRequest.prompt },
    });
  });

  it("allows MiniMax H3 as the second verified Free-plan model", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(account("free", 240)))
      .mockResolvedValueOnce(response({ id: "cuid-test-video-456", credits_charged: 120 }));
    const result = await generateVideo({
      request: request("/api/video/magic-hour/generate", { ...videoRequest, model: "minimax-h3" }, {
        key: "magic-test-key",
        freeUse: true,
      }),
    });
    expect(result.status).toBe(202);
    expect(await result.json()).toMatchObject({ model: "minimax-h3", creditsCharged: 120 });
    const job = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(job.model).toBe("minimax-h3");
  });

  it("rejects paid or unverified models before reading the account balance", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await generateVideo({
      request: request("/api/video/magic-hour/generate", { ...videoRequest, model: "veo3.1" }, {
        key: "magic-test-key",
        freeUse: true,
      }),
    });
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ code: "MODEL_NOT_ALLOWED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
