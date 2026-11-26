import { describe, expect, it } from "vitest";
import { channelBrand, promptTemplates, starterTopics, topicCategories } from "./creator-kit";

describe("SochoZara creator launch kit", () => {
  it("contains 30 uniquely numbered, usable starter topics", () => {
    expect(starterTopics).toHaveLength(30);
    expect(new Set(starterTopics.map((topic) => topic.id)).size).toBe(30);
    for (const topic of starterTopics) {
      expect(topic.title.trim().length).toBeGreaterThan(12);
      expect(topic.angle.trim().length).toBeGreaterThan(20);
      expect(topicCategories).toContain(topic.category);
    }
  });

  it("provides the Hinglish-first brand identity and channel description", () => {
    expect(channelBrand.name).toBe("SochoZara");
    expect(channelBrand.tagline).toContain("Duniya ke facts");
    expect(channelBrand.description).toContain("Hinglish");
    expect(channelBrand.logoDirection.length).toBeGreaterThan(30);
    expect(channelBrand.bannerDirection.length).toBeGreaterThan(30);
  });

  it("provides reusable prompts with practical placeholders", () => {
    expect(promptTemplates.length).toBeGreaterThanOrEqual(4);
    expect(promptTemplates.some((item) => item.prompt.includes("[TOPIC]"))).toBe(true);
    expect(promptTemplates.some((item) => item.prompt.includes("[PASTE SCRIPT]"))).toBe(true);
  });
});
