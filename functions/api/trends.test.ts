import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./trends";

afterEach(() => vi.restoreAllMocks());

describe("Google Trends RSS endpoint", () => {
  it("parses a current region feed and normalises source headlines", async () => {
    const xml = `<?xml version="1.0"?><rss><channel><item>
      <title>India &amp; technology</title><link>https://trends.google.com/trending/abc</link>
      <pubDate>Fri, 27 Nov 2026 08:00:00 GMT</pubDate><ht:approx_traffic>20K+</ht:approx_traffic>
      <ht:news_item><ht:news_item_title>Latest context</ht:news_item_title><ht:news_item_source>Example News</ht:news_item_source><ht:news_item_url>https://news.example/story</ht:news_item_url></ht:news_item>
    </item></channel></rss>`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(xml, { status: 200 }));
    const response = await onRequestGet({ request: new Request("https://studio.example/api/trends?region=IN") });
    expect(response.status).toBe(200);
    const payload = await response.json() as { region: string; trends: Array<{ title: string; traffic: string; relatedNews: Array<{ title: string; source: string }> }> };
    expect(payload.region).toBe("IN");
    expect(payload.trends[0]).toMatchObject({ title: "India & technology", traffic: "20K+" });
    expect(payload.trends[0].relatedNews[0]).toMatchObject({ title: "Latest context", source: "Example News" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://trends.google.com/trending/rss?geo=IN");
    expect(response.headers.get("Cache-Control")).toContain("900");
  });

  it("rejects unsupported regions before fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({ request: new Request("https://studio.example/api/trends?region=XX") });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unexpected, oversized feed content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not an RSS feed", { status: 200 }));
    const response = await onRequestGet({ request: new Request("https://studio.example/api/trends?region=IN") });
    expect(response.status).toBe(502);
  });

  it("handles temporary upstream rate limiting", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("too many requests", { status: 429 }));
    const response = await onRequestGet({ request: new Request("https://studio.example/api/trends?region=IN") });
    expect(response.status).toBe(429);
  });
});
