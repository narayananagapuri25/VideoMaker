import { describe, expect, it } from "vitest";
import { buildSubtitleCues, getActiveSubtitleCue } from "./subtitle-layout";

describe("subtitle layout", () => {
  it("keeps cues to at most two lines and preserves every word", () => {
    const text = "A stock market brings buyers and sellers together so investors can trade company shares fairly.";
    const cues = buildSubtitleCues(text, 8, 28);
    expect(cues.length).toBeGreaterThan(1);
    expect(cues.every((cue) => cue.text.split("\n").length <= 2)).toBe(true);
    expect(cues.map((cue) => cue.text.replace(/\n/g, " ")).join(" ")).toBe(text);
  });

  it("prefers sentence boundaries instead of cutting a short sentence in half", () => {
    const cues = buildSubtitleCues(
      "It starts globally. The price of crude oil moves on international markets.",
      7,
      38,
    );
    expect(cues[0].text.replace(/\n/g, " ")).toContain("It starts globally.");
    expect(cues.some((cue) => cue.text.trim().endsWith("."))).toBe(true);
    expect(cues.every((cue) => cue.text.split("\n").length <= 2)).toBe(true);
  });

  it("uses commas as pause points when a sentence is too long for two lines", () => {
    const text = "Oil is traded globally, currencies move against one another, and freight and refining costs also affect the final price at the pump.";
    const cues = buildSubtitleCues(text, 10, 30);
    expect(cues.every((cue) => cue.text.split("\n").length <= 2)).toBe(true);
    expect(cues.map((cue) => cue.text.replace(/\n/g, " ")).join(" ")).toBe(text);
    expect(cues.some((cue) => cue.text.trim().endsWith(","))).toBe(true);
  });

  it("distributes cue timings by words and punctuation and ends exactly at scene duration", () => {
    const cues = buildSubtitleCues("Short. This is a much longer caption line.", 6, 18);
    expect(cues[0].start).toBe(0);
    expect(cues[cues.length - 1].end).toBe(6);
    expect(cues.every((cue, index) => index === 0 || cue.start === cues[index - 1].end)).toBe(true);
    expect(cues[cues.length - 1].start).toBeGreaterThan(cues[0].start);
  });

  it("selects the active cue without returning an empty caption at the scene end", () => {
    const cues = buildSubtitleCues("First phrase. Second phrase.", 4, 18);
    expect(getActiveSubtitleCue(cues, 0)?.index).toBe(0);
    expect(getActiveSubtitleCue(cues, 3.9)?.index).toBe(cues.length - 1);
    expect(getActiveSubtitleCue([], 1)).toBeNull();
  });

  it("returns no cues for empty narration", () => {
    expect(buildSubtitleCues("   ", 5)).toEqual([]);
  });
});
