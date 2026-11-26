import { describe, expect, it } from "vitest";
import { buildGoogleFlowShotList, buildGoogleFlowVideoPrompt, GOOGLE_FLOW_URL } from "./flow-prompts";
import type { Scene, StudioProject } from "../types";

const opening: Scene = {
  id: "scene-1",
  title: "The impossible stop",
  narration: "What if Earth suddenly stopped spinning?",
  caption: "THE IMPOSSIBLE STOP",
  visualPrompt: "A detailed planet Earth rotates in space before slowing to a halt.",
  duration: 7.5,
};

const project: StudioProject = {
  id: "project-1",
  title: "What if Earth stopped spinning?",
  topic: "What if Earth suddenly stopped spinning?",
  language: "Hinglish",
  aspectRatio: "9:16",
  targetDuration: 45,
  script: opening.narration,
  scenes: [opening, {
    ...opening,
    id: "scene-2",
    title: "Air keeps its momentum",
    narration: "The atmosphere would initially keep moving.",
    visualPrompt: "Show clouds sweeping rapidly eastward above the curved horizon.",
    duration: 8,
  }],
  updatedAt: 0,
};

describe("Google Flow prompt handoff", () => {
  it("creates a topic-specific moving-video prompt in the selected aspect ratio", () => {
    const prompt = buildGoogleFlowVideoPrompt(opening, "9:16");
    expect(prompt).toContain("The impossible stop");
    expect(prompt).toContain("planet Earth rotates in space");
    expect(prompt).toContain("Vertical portrait 9:16");
    expect(prompt).toContain("approximately 8 seconds");
    expect(prompt).toContain("do not display or speak these words");
    expect(prompt).toContain("do not make a still image with a zoom effect");
    expect(prompt).toContain("No written words, captions, subtitles");
  });

  it("uses a landscape composition when requested", () => {
    expect(buildGoogleFlowVideoPrompt(opening, "16:9")).toContain("Horizontal cinematic 16:9");
  });

  it("exports separate, ordered prompts for every scene", () => {
    const shotList = buildGoogleFlowShotList(project);
    expect(shotList).toContain("SOCHOZARA STUDIO — GOOGLE FLOW SHOT LIST");
    expect(shotList).toContain("SCENE 01 — The impossible stop");
    expect(shotList).toContain("SCENE 02 — Air keeps its momentum");
    expect(shotList.indexOf("SCENE 01")).toBeLessThan(shotList.indexOf("SCENE 02"));
    expect(shotList.match(/VISUAL ACTION:/g)).toHaveLength(2);
    expect(shotList).toContain("scene-01.mp4");
  });

  it("uses Google's first-party Flow workspace", () => {
    expect(GOOGLE_FLOW_URL).toBe("https://labs.google/fx/tools/flow");
  });
});
