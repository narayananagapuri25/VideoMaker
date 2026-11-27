import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scene } from "../types";
import { attachFreeNasaFootage, searchNasaVideos } from "./nasa-video";

afterEach(() => vi.restoreAllMocks());

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "earth-orbit",
    title: "Earth from orbit",
    narration: "Earth looks blue from orbit.",
    caption: "A view of Earth.",
    visualPrompt: "Blue planet Earth viewed from a satellite in orbit.",
    duration: 7,
    ...overrides,
  };
}

const nasaResult = {
  nasaId: "EARTH_ORBIT_1",
  title: "Earth From Orbit",
  description: "The Earth seen from space.",
  keywords: ["Earth", "Orbit", "Planet"],
  dateCreated: "2024-01-01",
  center: "NASA",
  duration: 12,
  thumbnailUrl: "",
  pageUrl: "https://images.nasa.gov/details/EARTH_ORBIT_1",
  streamUrl: "/api/stock/nasa-videos/EARTH_ORBIT_1",
  source: "NASA",
  rightsBasis: "NASA media guidelines",
};

describe("free NASA scene footage", () => {
  it("searches the no-key same-origin NASA endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [nasaResult] }), { status: 200 }));
    const results = await searchNasaVideos("Earth from orbit");
    expect(results).toHaveLength(1);
    expect(results[0].nasaId).toBe("EARTH_ORBIT_1");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/stock/nasa-videos?q=Earth%20from%20orbit");
  });

  it("attaches only topic-matched NASA footage and keeps its source credit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [nasaResult] }), { status: 200 }));
    const result = await attachFreeNasaFootage([scene()]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.attachedTitles).toEqual(["Earth from orbit"]);
    expect(result.scenes[0]).toMatchObject({
      videoClipSource: "nasa",
      videoClipRef: "EARTH_ORBIT_1",
      videoClipAuthor: "NASA",
      videoRightsBasis: "nasa-educational",
      videoCommercialUseConfirmed: false,
    });
  });

  it("does not search unrelated subjects such as stock-market education", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await attachFreeNasaFootage([scene({ title: "How the stock market works", visualPrompt: "Investors trading company shares on an exchange." })]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.attachedTitles).toEqual([]);
    expect(result.scenes[0].videoClipSource).toBeUndefined();
  });
});
