import { describe, expect, it } from "vitest";
import type { Scene } from "../types";
import { getSceneTheme } from "./scene-visuals";
import { getSportsVisualKind } from "./sports-visuals";

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
    ["How the stock market works", "finance"],
    ["Why petrol prices change", "energy"],
    ["Inside a crude oil refinery", "energy"],
    ["A dramatic football match", "sports"],
    ["The making of a film", "entertainment"],
    ["A journey through Kyoto", "travel"],
    ["Street food cooking", "food"],
    ["A daily fitness workout", "health"],
    ["An unsolved mystery", "mystery"],
    ["A founder's life story", "biography"],
    ["An unexpected mystery", "mystery"],
  ] as const)("classifies %s as %s", (title, expected) => {
    expect(getSceneTheme(scene(title))).toBe(expected);
  });

  it("uses visual direction as well as the scene title", () => {
    expect(getSceneTheme(scene("The impossible stop", "A rotating blue planet viewed from orbit"))).toBe("earth");
  });
});


describe("sports-specific scene direction", () => {
  const sportsScene = (title: string, narration = ""): Scene => ({
    id: title,
    title,
    narration,
    caption: narration,
    visualPrompt: "",
    duration: 8,
  });

  it("selects cricket action artwork instead of the generic orb for the opening hook", () => {
    expect(getSportsVisualKind(sportsScene("The breaking news hook", "Rohit Sharma returns as Mumbai Indians captain."), 0))
      .toBe("stadium-action");
  });

  it("uses a captain walk-out for leadership and comeback scenes", () => {
    expect(getSportsVisualKind(sportsScene("The return journey", "Three years after losing the captaincy, Rohit is back in charge."), 1))
      .toBe("captain-return");
  });

  it("shows trophies instead of invented data bars for title history", () => {
    expect(getSportsVisualKind(sportsScene("The golden era", "Remember these five unforgettable seasons?"), 2))
      .toBe("trophy-legacy");
  });

  it("uses a squad movement visual for named player moves", () => {
    expect(getSportsVisualKind(sportsScene("Roster shakeup", "Arshdeep Singh joins Mumbai Indians."), 3))
      .toBe("squad-moves");
  });

  it("uses a stadium milestone visual for a landmark season", () => {
    expect(getSportsVisualKind(sportsScene("The landmark season", "Mumbai's twentieth season is approaching."), 4))
      .toBe("season-milestone");
  });

  it("uses a cricket action closing frame rather than a generic line graph", () => {
    expect(getSportsVisualKind(sportsScene("Your prediction?", "Can Mumbai bring the trophy back to Wankhede?"), 5))
      .toBe("match-question");
  });
});
