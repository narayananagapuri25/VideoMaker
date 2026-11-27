import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./[id]";

afterEach(() => vi.restoreAllMocks());

describe("NASA free MP4 streaming", () => {
  it("resolves a NASA asset manifest and relays MP4 byte ranges", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ collection: { items: [
        { href: "https://images-assets.nasa.gov/video/TEST_1/TEST_1~orig.mp4" },
        { href: "https://images-assets.nasa.gov/video/TEST_1/TEST_1~medium.mp4" },
      ] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: { "Content-Type": "video/mp4", "Content-Length": "3", "Content-Range": "bytes 0-2/10" },
      }));
    const response = await onRequestGet({
      request: new Request("https://studio.example/api/stock/nasa-videos/TEST_1", { headers: { Range: "bytes=0-2" } }),
      params: { id: "TEST_1" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Range")).toBe("bytes 0-2/10");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Range")).toBe("bytes=0-2");
    expect(String(fetchMock.mock.calls[1][0])).toContain("~medium.mp4");
  });

  it("rejects arbitrary asset IDs and never fetches an external URL supplied by a caller", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequestGet({
      request: new Request("https://studio.example/api/stock/nasa-videos/https%3A%2F%2Fevil.example%2Fvideo.mp4"),
      params: { id: "https://evil.example/video.mp4" },
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
