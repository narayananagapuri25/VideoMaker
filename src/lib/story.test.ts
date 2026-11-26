import { describe, expect, it } from "vitest";
import { buildLocalStory, makeProject, scenesFromScript } from "./story";

describe("local story helpers", () => {
  it("creates the bundled lightning example with six scenes", () => {
    const story = buildLocalStory("Why do we see lightning before thunder?", "Hinglish", 45);
    expect(story.title).toContain("Lightning");
    expect(story.scenes).toHaveLength(6);
    expect(story.script).toContain("3 lakh kilometres");
  });

  it("keeps the target duration across the generated scenes", () => {
    const story = buildLocalStory("A topic for a new video", "English", 60);
    const duration = story.scenes.reduce((total, scene) => total + scene.duration, 0);
    expect(duration).toBeCloseTo(60, 4);
  });

  it("creates a project with stable editing defaults", () => {
    const project = makeProject("Space facts", "Hinglish", "9:16", 45);
    expect(project.aspectRatio).toBe("9:16");
    expect(project.language).toBe("Hinglish");
    expect(project.scenes.length).toBeGreaterThanOrEqual(4);
    expect(project.scenes.every((scene) => scene.id.length > 0)).toBe(true);
  });

  it("turns edited script paragraphs into editable scenes", () => {
    const scenes = scenesFromScript("First paragraph.\n\nSecond paragraph.", 30);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].narration).toBe("First paragraph.");
    expect(scenes[1].caption).toBe("Second paragraph.");
  });
});