import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStoryWithAvailableProviders } from "./multi-ai";

afterEach(() => vi.restoreAllMocks());

const validStory = {
  title: "A documentary test",
  script: "A clear explanation with a beginning and an ending.",
  editorialNote: "Verify any topic-specific claims before publishing.",
  scenes: [
    {
      title: "The hook",
      narration: "A surprising opening fact.",
      caption: "The hook",
      visualPrompt: "A cinematic establishing shot with a single focal subject.",
      visualPlan: {
        layout: "hero",
        subject: "A dramatic establishing subject",
        headline: "LOOK CLOSER",
        labels: [],
        steps: [],
        values: [],
        trend: "flat",
        note: "",
      },
      duration: 5,
    },
    {
      title: "The explanation",
      narration: "Explain the underlying mechanism clearly.",
      caption: "How it works",
      visualPrompt: "A labelled process diagram with three stages.",
      visualPlan: {
        layout: "process",
        subject: "A three-stage process",
        headline: "HOW IT WORKS",
        labels: ["Start", "Change", "Result"],
        steps: ["Start", "Change", "Result"],
        values: [],
        trend: "flat",
        note: "",
      },
      duration: 5,
    },
  ],
};

function options(credentials: {
  gemini?: string;
  groq?: string;
  openrouter?: string;
  cloudflareApiToken?: string;
  cloudflareAccountId?: string;
}) {
  return {
    topic: "Why do we see lightning before thunder?",
    language: "English" as const,
    targetDuration: 30,
    aspectRatio: "9:16" as const,
    credentials,
  };
}

describe("multi-provider AI storyboard fallback", () => {
  it("falls back from Gemini quota exhaustion to Groq", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 429, message: "Quota exceeded." },
      }), { status: 429, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validStory) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateStoryWithAvailableProviders(options({
      gemini: "gemini-test-key",
      groq: "groq-test-key",
    }));

    expect(result.source).toBe("groq");
    expect(result.attempted).toEqual(["gemini", "groq"]);
    expect(result.fallbackNotice).toContain("Groq completed the storyboard");
    expect(result.story.title).toBe("A documentary test");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("generativelanguage.googleapis.com");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.groq.com/openai/v1/chat/completions");
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request.model).toBe("openai/gpt-oss-120b");
    expect(request.response_format).toEqual({ type: "json_object" });
  });

  it("skips unconfigured providers and falls back after a malformed model response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "{not valid JSON" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validStory) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await generateStoryWithAvailableProviders(options({
      groq: "groq-test-key",
      openrouter: "openrouter-test-key",
    }));

    expect(result.source).toBe("openrouter");
    expect(result.attempted).toEqual(["groq", "openrouter"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://openrouter.ai/api/v1/chat/completions");
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request.model).toBe("openrouter/free");
  });

  it("fails clearly when no API provider is configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(generateStoryWithAvailableProviders(options({})))
      .rejects.toThrow(/connect at least one AI provider/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
