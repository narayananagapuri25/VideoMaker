import { describe, expect, it } from "vitest";
import { buildSceneImagePrompt } from "./art-prompt";
import type { Scene } from "../types";

const scene: Scene = {
  id: "scene-1",
  title: "An ancient stepwell",
  narration: "Ancient builders designed ingenious water systems.",
  caption: "Engineering from another era.",
  visualPrompt: "An atmospheric ancient Indian stepwell at golden hour",
  duration: 8,
};

describe("scene art prompt builder", () => {
  it("adds vertical composition and SochoZara visual direction for Shorts", () => {
    const prompt = buildSceneImagePrompt(scene, "9:16");
    expect(prompt).toContain("vertical portrait 9:16");
    expect(prompt).toContain("midnight navy");
    expect(prompt).toContain("No text, lettering, logos");
  });

  it("uses landscape composition for a documentary", () => {
    expect(buildSceneImagePrompt(scene, "16:9")).toContain("horizontal landscape 16:9");
  });
});
