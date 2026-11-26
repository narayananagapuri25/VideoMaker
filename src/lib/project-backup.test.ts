import { describe, expect, it } from "vitest";
import { restoreProjectBackup, MAX_PROJECT_SCENES } from "./project-backup";
import { MAX_PROJECT_MEDIA_BYTES } from "./media-data";

function validBackup(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    title: "Test project",
    topic: "A tested topic",
    language: "Hinglish",
    aspectRatio: "9:16",
    targetDuration: 45,
    script: "A narration script.",
    scenes: [{
      id: "scene-1",
      title: "Opening",
      narration: "A line of narration.",
      caption: "A caption.",
      visualPrompt: "A visual prompt.",
      duration: 6,
    }],
    storyboardSourceTopic: "A tested topic",
    storyboardSourceScript: "A narration script.",
    storyboardSourceTargetDuration: 45,
    storyboardSourceAspectRatio: "9:16",
    storyboardSourceLanguage: "Hinglish",
    ...overrides,
  };
}

describe("project backup validation", () => {
  it("restores a valid project and preserves sync metadata", () => {
    const project = restoreProjectBackup(validBackup());
    expect(project.title).toBe("Test project");
    expect(project.scenes).toHaveLength(1);
    expect(project.storyboardSourceLanguage).toBe("Hinglish");
    expect(project.storyboardSourceScript).toBe("A narration script.");
  });

  it("normalises unknown settings and rejects non-finite or unsupported durations", () => {
    const project = restoreProjectBackup(validBackup({
      language: "Klingon",
      aspectRatio: "4:3",
      targetDuration: Infinity,
      scenes: [{ id: "one", duration: Infinity }],
    }));
    expect(project.language).toBe("Hinglish");
    expect(project.aspectRatio).toBe("9:16");
    expect(project.targetDuration).toBe(45);
    expect(project.scenes[0].duration).toBe(5);
  });

  it("re-confirms rights for imported artwork instead of trusting backup flags", () => {
    const image = "data:image/png;base64,iVBORw0KGgo=";
    const project = restoreProjectBackup(validBackup({
      scenes: [{ ...validBackup().scenes[0], imageDataUrl: image, imageCommercialUseConfirmed: true }],
    }));
    expect(project.scenes[0].imageCommercialUseConfirmed).toBe(false);
  });

  it("rejects remote media and unsupported media data", () => {
    expect(() => restoreProjectBackup(validBackup({
      scenes: [{ ...validBackup().scenes[0], imageDataUrl: "https://example.com/image.png" }],
    }))).toThrow(/unsupported, external or oversized scene image/i);
    expect(() => restoreProjectBackup(validBackup({
      voiceAudioDataUrl: "https://example.com/audio.mp3",
    }))).toThrow(/unsupported, external or oversized narration/i);
  });

  it("rejects duplicate scene IDs, oversized text, and excessive scene counts safely", () => {
    expect(() => restoreProjectBackup(validBackup({
      scenes: [{ id: "same" }, { id: "same" }],
    }))).not.toThrow();
    expect(() => restoreProjectBackup(validBackup({ script: "x".repeat(60_001) }))).toThrow(/script is too long/i);
    expect(() => restoreProjectBackup(validBackup({
      scenes: Array.from({ length: MAX_PROJECT_SCENES + 1 }, () => ({})),
    }))).toThrow(/too many scenes/i);
  });

  it("enforces the combined media budget", () => {
    const oneImage = "data:image/png;base64,iVBORw0KGgoA" + "A".repeat(16 * 1024 * 1024 - 13) + "=";
    const scenes = Array.from({ length: 6 }, (_, index) => ({
      id: "scene-" + index,
      imageDataUrl: oneImage,
    }));
    expect(MAX_PROJECT_MEDIA_BYTES).toBe(64 * 1024 * 1024);
    expect(() => restoreProjectBackup(validBackup({ scenes }))).toThrow(/64 MB project media limit/i);
  });

  it("rejects malformed project roots", () => {
    expect(() => restoreProjectBackup(null)).toThrow(/not a valid/i);
    expect(() => restoreProjectBackup({})).toThrow(/not a valid/i);
  });
});
