import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as getConnection } from "../../functions/api/video/agnes/connection";
import { onRequestPost as generateVideo } from "../../functions/api/video/agnes/generate";
import { onRequestPost as pollVideo } from "../../functions/api/video/agnes/status";
import { isSafeAgnesDownloadUrl } from "../../functions/api/video/agnes/_shared";

afterEach(() => vi.restoreAllMocks());

const KEY = "agnes-test-key";
const videoRequest = {
  prompt: "A cinematic documentary shot of Earth turning in deep space",
  seconds: 6,
  aspectRatio: "9:16",
};

function request(
  path: string,
  body?: unknown,
  options: { key?: string; freeTrial?: boolean; origin?: string } = {},
): Request {
  const headers = new Headers();
  headers.set("Origin", options.origin ?? "https://studio.example");
  if (options.key) headers.set("X-SochoZara-Agnes-Key", options.key);
  if (options.freeTrial) headers.set("X-SochoZara-Agnes-Free-Trial", "true");
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

describe("Agnes Video 2.5 Flash trial integration", () => {
  it("checks model access without enabling generation or claiming billing status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      data: [{ id: "agnes-video-2.5-flash" }],
    }));

    const result = await getConnection({
      request: request("/api/video/agnes/connection", undefined, { key: KEY }),
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      connected: true,
      modelAvailable: true,
      model: "agnes-video-2.5-flash",
      resolution: "720P",
      minimumSeconds: 4,
      maximumSeconds: 12,
      trialPrice: "$0 per second · limited-time Angel User Trial offer",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://apihub.agnes-ai.com/v1/models");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer " + KEY);
  });

  it("blocks video submission unless the creator attests to the current free-trial account and price", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await generateVideo({
      request: request("/api/video/agnes/generate", videoRequest, { key: KEY }),
    });
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: "AGNES_FREE_TRIAL_CONFIRMATION_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits the documented model and 720P parameters after explicit attestation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      video_id: "agnes-video-job-12345678",
      status: "queued",
    }));

    const result = await generateVideo({
      request: request("/api/video/agnes/generate", videoRequest, {
        key: KEY,
        freeTrial: true,
      }),
    });

    expect(result.status).toBe(202);
    expect(await result.json()).toMatchObject({
      videoId: "agnes-video-job-12345678",
      model: "agnes-video-2.5-flash",
      resolution: "720P",
      requestedSeconds: 6,
      status: "queued",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://apihub.agnes-ai.com/v1/videos");
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      model: "agnes-video-2.5-flash",
      prompt: videoRequest.prompt,
      seconds: "6",
      mode: "text",
      size: "720P",
      aspect_ratio: "9:16",
      n: 1,
    });
  });

  it("rejects durations outside 4–12 seconds before any external request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await generateVideo({
      request: request("/api/video/agnes/generate", { ...videoRequest, seconds: 3 }, {
        key: KEY,
        freeTrial: true,
      }),
    });
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ code: "INVALID_DURATION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls the exact Agnes model job and returns the completed video URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      video_id: "agnes-video-job-12345678",
      status: "completed",
      progress: 100,
      url: "https://cdn.example.test/video.mp4",
    }));
    const result = await pollVideo({
      request: request("/api/video/agnes/status", { videoId: "agnes-video-job-12345678" }, {
        key: KEY,
        freeTrial: true,
      }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      videoId: "agnes-video-job-12345678",
      status: "completed",
      progress: 100,
      url: "https://cdn.example.test/video.mp4",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://apihub.agnes-ai.com/agnesapi?video_id=agnes-video-job-12345678&model_name=agnes-video-2.5-flash",
    );
  });

  it("only accepts public HTTPS file URLs for download proxying", () => {
    expect(isSafeAgnesDownloadUrl("https://cdn.example.test/video.mp4")?.protocol).toBe("https:");
    expect(isSafeAgnesDownloadUrl("http://cdn.example.test/video.mp4")).toBeNull();
    expect(isSafeAgnesDownloadUrl("https://127.0.0.1/video.mp4")).toBeNull();
    expect(isSafeAgnesDownloadUrl("https://localhost/video.mp4")).toBeNull();
    expect(isSafeAgnesDownloadUrl("https://user:pass@cdn.example.test/video.mp4")).toBeNull();
  });
});
