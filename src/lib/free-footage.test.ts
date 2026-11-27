import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scene } from "../types";
import { attachFreePixabayFootage } from "./free-footage";

afterEach(() => vi.restoreAllMocks());

function scene(id: string, title: string, visualPrompt: string): Scene {
  return { id, title, narration: "Explain the subject.", caption: title, visualPrompt, duration: 7 };
}

describe("cross-genre free Pixabay footage matching", () => {
  it("matches relevant results for different genres and keeps creator/source metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const query = new URL("https://local" + String(input)).searchParams.get("q") || "";
      const tags = query.includes("football") ? ["football", "stadium", "soccer", "match"] :
        query.includes("street") ? ["street food", "cooking", "market", "food"] :
          ["technology", "robot", "factory", "automation"];
      return new Response(JSON.stringify({ results: [{
        id: query.includes("football") ? 101 : query.includes("street") ? 202 : 303,
        pageUrl: "https://pixabay.com/videos/sample/",
        duration: 12,
        author: "Creator",
        thumbnailUrl: "https://cdn.pixabay.com/video/preview.jpg",
        width: 1920,
        height: 1080,
        tags,
      }] }), { status: 200 });
    });

    const scenes = [
      scene("sports", "Football stadium", "Football match in a crowded stadium with players and ball"),
      scene("food", "Street food cooking", "Street food vendor cooking noodles over a hot flame"),
      scene("tech", "Factory robots", "Industrial robots assembling products on an automated factory line"),
    ];
    const result = await attachFreePixabayFootage(scenes);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.attachedTitles).toEqual(["Football stadium", "Street food cooking", "Factory robots"]);
    expect(result.scenes.map((item) => item.videoClipSource)).toEqual(["pixabay", "pixabay", "pixabay"]);
    expect(result.scenes[0]).toMatchObject({
      videoClipId: 101,
      videoClipAuthor: "Creator",
      videoRightsBasis: "pixabay-content-license",
    });
  });

  it("does not overwrite footage already attached from another source", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const scenes = [scene("space", "Earth from orbit", "Planet earth satellite view")];
    scenes[0].videoClipSource = "nasa";
    const result = await attachFreePixabayFootage(scenes);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.scenes[0].videoClipSource).toBe("nasa");
  });

  it("rejects unrelated results and preserves the original artwork fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [{
      id: 1, pageUrl: "https://pixabay.com/videos/unrelated/", duration: 5, author: "Creator",
      thumbnailUrl: "https://cdn.pixabay.com/video/x.jpg", width: 1280, height: 720, tags: ["underwater", "fish"],
    }] }), { status: 200 }));
    const scenes = [scene("news", "Election debate", "Parliament campaign speech and voting booths")];
    const result = await attachFreePixabayFootage(scenes);
    expect(result.attachedTitles).toEqual([]);
    expect(result.scenes[0].videoClipSource).toBeUndefined();
  });
});
