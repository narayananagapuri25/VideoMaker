import { afterEach, describe, expect, it, vi } from "vitest";
import { getSceneVideoSrc, searchStockVideos } from "./stock-video";
import type { Scene } from "../types";

afterEach(() => vi.restoreAllMocks());

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    title: "Earth from space",
    narration: "A short line.",
    caption: "Earth",
    visualPrompt: "Earth rotating",
    duration: 7,
    ...overrides,
  };
}

describe("scene video sources", () => {
  it("uses embedded local video data without a remote request", () => {
    const dataUrl = "data:video/mp4;base64,AAAA";
    expect(getSceneVideoSrc(scene({ videoDataUrl: dataUrl }))).toBe(dataUrl);
  });

  it("builds a same-origin stream URL for a Pixabay clip", () => {
    expect(getSceneVideoSrc(scene({ videoClipSource: "pixabay", videoClipId: 98765 })))
      .toBe("/api/stock/videos/98765?quality=medium");
  });

  it("does not invent a video source for an unassigned scene", () => {
    expect(getSceneVideoSrc(scene())).toBeUndefined();
  });
});

describe("Pixabay stock search", () => {
  it("normalises a successful search result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      results: [{
        id: 123,
        pageUrl: "https://pixabay.com/videos/earth-123/",
        duration: 12,
        author: "Creator",
        thumbnailUrl: "https://cdn.pixabay.com/video/preview.jpg",
        width: 1920,
        height: 1080,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const results = await searchStockVideos(" Earth from space ");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(123);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/stock/videos?q=Earth%20from%20space");
  });

  it("surfaces Cloudflare configuration errors from the server", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "PIXABAY_API_KEY is missing.",
    }), { status: 503 }));
    await expect(searchStockVideos("earth")).rejects.toThrow(/PIXABAY_API_KEY is missing/i);
  });

  it("rejects very short searches before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(searchStockVideos("x")).rejects.toThrow(/at least two words/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
