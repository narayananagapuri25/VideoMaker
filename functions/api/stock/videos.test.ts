import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./videos";

afterEach(() => vi.restoreAllMocks());

describe("Pixabay free stock video search route", () => {
  it("requires an optional free API key without calling a provider when absent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({
      request: new Request("https://studio.example/api/stock/videos?q=football"),
      env: {},
    });
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns source page, author, tags and dimensions for usable videos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      totalHits: 1,
      hits: [{
        id: 77,
        pageURL: "https://pixabay.com/videos/football-stadium-77/",
        duration: 14,
        user: "Creator",
        tags: "football, stadium, sports",
        videos: {
          small: { thumbnail: "https://cdn.pixabay.com/video/small.jpg", width: 1280, height: 720 },
          medium: { thumbnail: "https://cdn.pixabay.com/video/medium.jpg", width: 1920, height: 1080 },
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await onRequestGet({
      request: new Request("https://studio.example/api/stock/videos?q=football%20stadium"),
      env: { PIXABAY_API_KEY: "test-key" },
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as { results: Array<{ id: number; tags: string[]; author: string; pageUrl: string; width: number }> };
    expect(payload.results[0]).toMatchObject({
      id: 77,
      tags: ["football", "stadium", "sports"],
      author: "Creator",
      pageUrl: "https://pixabay.com/videos/football-stadium-77/",
      width: 1920,
    });
    expect(response.headers.get("Cache-Control")).toContain("86400");
  });

  it("rejects malformed phrases without contacting Pixabay", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({
      request: new Request("https://studio.example/api/stock/videos?q=x"),
      env: { PIXABAY_API_KEY: "test-key" },
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
