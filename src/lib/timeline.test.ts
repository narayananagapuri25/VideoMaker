import { describe, expect, it } from "vitest";
import { clampPlayhead, getSceneAtTime, getSceneStartTime, getSceneTransitionProgress, getTimelineDuration } from "./timeline";
import type { Scene } from "../types";

const scenes: Scene[] = [
  { id: "one", title: "One", narration: "", caption: "", visualPrompt: "", duration: 4 },
  { id: "two", title: "Two", narration: "", caption: "", visualPrompt: "", duration: 6 },
  { id: "three", title: "Three", narration: "", caption: "", visualPrompt: "", duration: 5 },
];

describe("timeline helpers", () => {
  it("calculates total duration", () => {
    expect(getTimelineDuration(scenes)).toBe(15);
  });

  it("returns the correct scene and local offset", () => {
    expect(getSceneAtTime(scenes, 7)).toMatchObject({ index: 1, start: 4, end: 10, offset: 3 });
    expect(getSceneAtTime(scenes, 14.5)?.scene.id).toBe("three");
  });

  it("clamps times at the start and end of the timeline", () => {
    expect(clampPlayhead(scenes, -3)).toBe(0);
    expect(clampPlayhead(scenes, 20)).toBe(15);
    expect(getSceneAtTime(scenes, 100)?.scene.id).toBe("three");
  });

  it("cross-fades the outgoing scene into its successor near the scene boundary", () => {
    const position = getSceneAtTime(scenes, 3.8)!;
    expect(getSceneTransitionProgress(position, true)).toBeGreaterThan(0);
    expect(getSceneTransitionProgress(position, true)).toBeLessThan(1);
    expect(getSceneTransitionProgress(getSceneAtTime(scenes, 2)!, true)).toBe(0);
    expect(getSceneTransitionProgress(getSceneAtTime(scenes, 14.5)!, false)).toBe(0);
  });
  it("finds a scene start for timeline navigation", () => {
    expect(getSceneStartTime(scenes, "three")).toBe(10);
    expect(getSceneStartTime(scenes, "missing")).toBe(0);
  });
});
