import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTrendingTopics } from "./trends";

afterEach(() => vi.restoreAllMocks());

describe("trend discovery client", () => {
  it("loads a regional feed and returns ranked current topics", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      region: "IN",
      source: "Google Trends",
      trends: [{ title: "Trending topic", traffic: "10K+", publishedAt: "", link: "https://trends.google.com/trending", relatedNews: [] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const topics = await loadTrendingTopics("IN");
    expect(topics[0].title).toBe("Trending topic");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/trends?region=IN");
  });

  it("does not send an unsupported region to the server", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(loadTrendingTopics("XX")).rejects.toThrow(/supported trends region/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
