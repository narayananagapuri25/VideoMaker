import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./nasa-videos";

afterEach(() => vi.restoreAllMocks());

describe("NASA free video archive search", () => {
  it("returns direct-safe metadata for video results without requiring an API key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      collection: {
        metadata: { total_hits: 42 },
        items: [{
          data: [{ nasa_id: "EARTH_001", title: "Earth From Orbit", media_type: "video", date_created: "2024-01-01", center: "NASA", keywords: ["Earth", "Orbit"], description: "A view of Earth from orbit." }],
          links: [{ rel: "preview", href: "https://images-assets.nasa.gov/video/EARTH_001/thumb.jpg" }],
        }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await onRequestGet({ request: new Request("https://studio.example/api/stock/nasa-videos?q=earth%20orbit") });
    expect(response.status).toBe(200);
    const payload = await response.json() as { results: Array<{ nasaId: string; streamUrl: string; source: string }>; totalHits: number; requiresApiKey: boolean };
    expect(payload.totalHits).toBe(42);
    expect(payload.requiresApiKey).toBe(false);
    expect(payload.results[0]).toMatchObject({
      nasaId: "EARTH_001",
      source: "NASA",
      streamUrl: "/api/stock/nasa-videos/EARTH_001",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://images-api.nasa.gov/search?");
    expect(String(fetchMock.mock.calls[0][0])).toContain("media_type=video");
  });

  it("filters out third-party copyright warnings and identifiable people", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      collection: { items: [
        { data: [{ nasa_id: "COPYRIGHT_1", title: "Earth film", media_type: "video", copyright: "Acme Studios" }] },
        { data: [{ nasa_id: "PERSON_1", title: "Astronaut interview", media_type: "video", description: "An astronaut talks about the mission." }] },
        { data: [{ nasa_id: "SAFE_1", title: "Earth animation", media_type: "video", keywords: ["Earth"] }] },
      ] },
    }), { status: 200 }));
    const response = await onRequestGet({ request: new Request("https://studio.example/api/stock/nasa-videos?q=Earth") });
    const payload = await response.json() as { results: Array<{ nasaId: string }> };
    expect(payload.results.map((item) => item.nasaId)).toEqual(["SAFE_1"]);
  });

  it("rejects invalid search phrases before contacting NASA", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({ request: new Request("https://studio.example/api/stock/nasa-videos?q=x") });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
