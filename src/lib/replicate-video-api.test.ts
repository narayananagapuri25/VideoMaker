import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as getConnection } from "../../functions/api/video/replicate/connection";
import { onRequestPost as generateVideo } from "../../functions/api/video/replicate/generate";
import { onRequestPost as pollPrediction } from "../../functions/api/video/replicate/status";
import { onRequestPost as downloadVideo } from "../../functions/api/video/replicate/download";
import { isSafeReplicateDownloadUrl } from "../../functions/api/video/replicate/_shared";

afterEach(() => vi.restoreAllMocks());

const TOKEN = "replicate-test-token";
const PROMPT = "A cinematic documentary shot of Earth turning in deep space";

function request(
  path: string,
  body?: unknown,
  options: { token?: string; tryFree?: boolean; origin?: string } = {},
): Request {
  const headers = new Headers();
  headers.set("Origin", options.origin ?? "https://studio.example");
  if (options.token) headers.set("X-SochoZara-Replicate-Key", options.token);
  if (options.tryFree) headers.set("X-SochoZara-Replicate-Try-Free", "true");
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request("https://studio.example" + path, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Replicate minimax/video-01 Try-for-Free integration", () => {
  it("checks token and model access without enabling paid or free-run generation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      owner: "minimax",
      name: "video-01",
    }));
    const result = await getConnection({
      request: request("/api/video/replicate/connection", undefined, { token: TOKEN }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      connected: true,
      modelAvailable: true,
      model: "minimax/video-01",
      tryForFree: true,
      freeRunLimit: "limited and not published",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.replicate.com/v1/models/minimax/video-01");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer " + TOKEN);
  });

  it("blocks prediction creation until the creator confirms Try-for-Free-only account use", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await generateVideo({
      request: request("/api/video/replicate/generate", { prompt: PROMPT }, { token: TOKEN }),
    });
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: "REPLICATE_TRY_FREE_CONFIRMATION_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates only the minimax/video-01 model prediction after free-run attestation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      id: "replicate-prediction-12345678",
      status: "starting",
      urls: { get: "https://api.replicate.com/v1/predictions/replicate-prediction-12345678" },
    }, 201));
    const result = await generateVideo({
      request: request("/api/video/replicate/generate", { prompt: PROMPT }, {
        token: TOKEN,
        tryFree: true,
      }),
    });
    expect(result.status).toBe(202);
    expect(await result.json()).toMatchObject({
      predictionId: "replicate-prediction-12345678",
      model: "minimax/video-01",
      status: "starting",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.replicate.com/v1/models/minimax/video-01/predictions");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({ input: { prompt: PROMPT } });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("prefer")).toBe("wait=1");
  });

  it("surfaces exhausted free access or billing requirements without retrying", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      detail: "Payment required. Add billing to continue.",
    }, 402));
    const result = await generateVideo({
      request: request("/api/video/replicate/generate", { prompt: PROMPT }, {
        token: TOKEN,
        tryFree: true,
      }),
    });
    expect(result.status).toBe(402);
    expect(await result.json()).toMatchObject({ code: "REPLICATE_BILLING_REQUIRED" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("polls a prediction and exposes output readiness", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      id: "replicate-prediction-12345678",
      status: "succeeded",
      output: "https://replicate.delivery/video/output.mp4",
    }));
    const result = await pollPrediction({
      request: request("/api/video/replicate/status", { predictionId: "replicate-prediction-12345678" }, {
        token: TOKEN,
        tryFree: true,
      }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      predictionId: "replicate-prediction-12345678",
      status: "succeeded",
      outputReady: true,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.replicate.com/v1/predictions/replicate-prediction-12345678");
  });

  it("downloads successful outputs through a bounded Replicate-host proxy", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        id: "replicate-prediction-12345678",
        status: "succeeded",
        output: "https://replicate.delivery/output.mp4",
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "video/mp4", "Content-Length": "4" },
      }));
    const result = await downloadVideo({
      request: request("/api/video/replicate/download", { predictionId: "replicate-prediction-12345678" }, {
        token: TOKEN,
        tryFree: true,
      }),
    });
    expect(result.status).toBe(200);
    expect(result.headers.get("Content-Type")).toBe("video/mp4");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown download hosts and unsafe URL forms", () => {
    expect(isSafeReplicateDownloadUrl("https://replicate.delivery/output.mp4")?.protocol).toBe("https:");
    expect(isSafeReplicateDownloadUrl("https://cdn.replicate.delivery/output.mp4")?.hostname).toBe("cdn.replicate.delivery");
    expect(isSafeReplicateDownloadUrl("https://example.com/output.mp4")).toBeNull();
    expect(isSafeReplicateDownloadUrl("http://replicate.delivery/output.mp4")).toBeNull();
    expect(isSafeReplicateDownloadUrl("https://127.0.0.1/output.mp4")).toBeNull();
    expect(isSafeReplicateDownloadUrl("https://user:pass@replicate.delivery/output.mp4")).toBeNull();
  });
});
