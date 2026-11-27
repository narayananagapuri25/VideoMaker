import { describe, expect, it } from "vitest";
import type { Scene } from "../types";
import { getSceneVisualMode, getUnverifiedSceneMedia } from "./video-generation";

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    title: "Test scene",
    narration: "Narration",
    caption: "Caption",
    visualPrompt: "A cinematic test scene",
    duration: 5,
    ...overrides,
  };
}

describe("in-house video generation", () => {
  it("uses procedural motion graphics when a scene has no uploaded media", () => {
    expect(getSceneVisualMode(scene())).toBe("procedural-motion");
  });

  it("animates imported artwork locally when no video clip is attached", () => {
    expect(getSceneVisualMode(scene({ imageDataUrl: "data:image/png;base64,AA==" }))).toBe("artwork-motion");
  });

  it("prefers real footage when a local or Pixabay video is attached", () => {
    expect(getSceneVisualMode(scene({ videoDataUrl: "data:video/mp4;base64,AA==" }))).toBe("footage");
    expect(getSceneVisualMode(scene({ videoClipSource: "pixabay", videoClipId: 123 }))).toBe("footage");
  });

  it("requires rights confirmation only for imported artwork and footage", () => {
    const scenes = [
      scene({ title: "Original motion" }),
      scene({ id: "image", title: "Artwork", imageDataUrl: "data:image/png;base64,AA==" }),
      scene({ id: "video", title: "Imported video", videoDataUrl: "data:video/mp4;base64,AA==" }),
      scene({ id: "licensed", title: "Confirmed art", imageDataUrl: "data:image/png;base64,AA==", imageCommercialUseConfirmed: true }),
      scene({ id: "generated", title: "AI artwork", imageDataUrl: "data:image/jpeg;base64,AA==", imageGeneratedByAI: true }),
    ];
    expect(getUnverifiedSceneMedia(scenes)).toEqual(["Artwork", "Imported video"]);
  });
});
