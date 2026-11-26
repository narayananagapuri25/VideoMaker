import { describe, expect, it } from "vitest";
import {
  buildLocalStory,
  deriveTopicFromScript,
  makeProject,
  parsePastedNarration,
  scenesFromScript
} from "./story";

const earthScript = [
  "Ab imagine karo, Earth achanak ruk gayi... lekin atmosphere aur oceans apni motion continue karte rahe!",
  "Equator ke paas hawa aur samundar mein devastating movement ho sakti hai.",
  "Buildings, infrastructure aur ecosystems ko enormous damage ho sakta hai.",
  "Lekin Earth ko literally 5 seconds mein rokna ek extreme hypothetical situation hai.",
  "Toh question yeh hai... kya hum survive kar paayenge?",
  "Aise mind-blowing facts ke liye follow karo SochoZara!"
].join("\\n") + "\\nScientific note: This is a hypothetical scenario, not a realistic prediction.";

describe("local story helpers", () => {
  it("creates the bundled lightning example with six scenes", () => {
    const story = buildLocalStory("Why do we see lightning before thunder?", "Hinglish", 45);
    expect(story.title).toContain("Lightning");
    expect(story.scenes).toHaveLength(6);
    expect(story.script).toContain("3 lakh kilometres");
  });

  it("creates a topic-specific Earth-stop script instead of generic filler", () => {
    const story = buildLocalStory("What if Earth suddenly stopped spinning?", "Hinglish", 45);
    expect(story.title).toContain("Earth");
    expect(story.script).toContain("1,670 kilometres per hour");
    expect(story.script).toContain("inertia");
    expect(story.script).not.toContain("surface-level fact");
    expect(story.scenes).toHaveLength(6);
    expect(story.editorialNote).toContain("thought experiment");
  });

  it("detects pasted narration and extracts the scientific note separately", () => {
    const parsed = parsePastedNarration(earthScript);
    expect(parsed).not.toBeNull();
    expect(parsed?.script).not.toContain("Scientific note");
    expect(parsed?.script.endsWith("SochoZara!")).toBe(true);
    expect(parsed?.editorialNote).toContain("hypothetical scenario");
    expect(deriveTopicFromScript(parsed!.script)).toBe("What if Earth suddenly stopped spinning?");
  });

  it("builds matching Earth scenes from a pasted script without generic additions", () => {
    const parsed = parsePastedNarration(earthScript);
    const scenes = scenesFromScript(parsed!.script, 45, deriveTopicFromScript(parsed!.script));
    expect(scenes.length).toBe(6);
    expect(scenes.map((scene) => scene.narration).join(" ")).toContain("Equator ke paas");
    expect(scenes.map((scene) => scene.narration).join(" ")).not.toContain("surface-level fact");
    expect(scenes[0].title).toBe("The impossible stop");
    expect(scenes[0].visualPrompt).toContain("Earth");
    expect(scenes.reduce((total, scene) => total + scene.duration, 0)).toBeCloseTo(45, 4);
  });

  it("does not mistake a short topic for a pasted narration", () => {
    expect(parsePastedNarration("Why do we see lightning before thunder?")).toBeNull();
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
    expect(project.storyboardSourceTopic).toBe(project.topic);
    expect(project.storyboardSourceScript).toBe(project.script);
  });

  it("turns edited script paragraphs into editable scenes", () => {
    const scenes = scenesFromScript("First paragraph.\n\nSecond paragraph.", 30);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].narration).toBe("First paragraph.");
    expect(scenes[1].caption).toBe("Second paragraph.");
  });
});