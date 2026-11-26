import { describe, expect, it } from "vitest";
import type { Scene } from "../types";
import { getSceneTheme } from "./scene-visuals";

function scene(title: string, visualPrompt = ""): Pick<Scene, "title" | "caption" | "visualPrompt"> {
  return { title, caption: "", visualPrompt };
}

describe("cinematic scene visual themes", () => {
  it.each([
    ["Earth's rotation", "earth"],
    ["A black hole in deep space", "space"],
    ["Why lightning strikes", "weather"],
    ["How ocean waves form", "ocean"],
    ["A city after dark", "city"],
    ["Inside an AI computer chip", "technology"],
    ["An ancient temple", "history"],
    ["Life in a rainforest", "nature"],
    ["How atoms behave", "science"],
    ["An unexpected mystery", "generic"],
  ] as const)("classifies %s as %s", (title, expected) => {
    expect(getSceneTheme(scene(title))).toBe(expected);
  });

  it("uses visual direction as well as the scene title", () => {
    expect(getSceneTheme(scene("The impossible stop", "A rotating blue planet viewed from orbit"))).toBe("earth");
  });
});
