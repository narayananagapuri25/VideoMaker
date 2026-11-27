import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAIProviderHealth,
  getAIProviderHealth,
  getAIProviderHealthHeader,
  isProviderCoolingDown,
  parseAIProviderHealthHeader,
  saveAIProviderHealth,
} from "./ai-provider-health";

function useSessionStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } satisfies Storage;
  vi.stubGlobal("sessionStorage", storage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session-only AI provider health", () => {
  it("persists health signals in the current browser tab and exposes a compact request header", () => {
    useSessionStorage();
    saveAIProviderHealth({
      openrouter: {
        state: "available",
        checkedAt: Date.now(),
        remainingRequests: 18,
        limitRequests: 50,
        note: "Verified daily free quota.",
        source: "provider-api",
      },
    });

    expect(getAIProviderHealth().openrouter?.remainingRequests).toBe(18);
    const header = getAIProviderHealthHeader()["X-SochoZara-AI-Health"];
    expect(JSON.parse(header).openrouter.remainingRequests).toBe(18);
  });

  it("rejects malformed and oversized provider health headers", () => {
    expect(parseAIProviderHealthHeader("{broken")).toEqual({});
    expect(parseAIProviderHealthHeader("x".repeat(2_501))).toEqual({});
    expect(parseAIProviderHealthHeader(JSON.stringify({
      gemini: { state: "paid", checkedAt: Date.now(), note: "invalid", source: "app" },
    }))).toEqual({});
  });

  it("keeps exhausted providers cooling down only until their retry time", () => {
    const entry = {
      state: "exhausted" as const,
      checkedAt: Date.now(),
      retryAt: Date.now() + 60_000,
      note: "Free daily quota used.",
      source: "last-response" as const,
    };
    expect(isProviderCoolingDown(entry, Date.now())).toBe(true);
    expect(isProviderCoolingDown(entry, entry.retryAt! + 1)).toBe(false);
    expect(isProviderCoolingDown({ ...entry, state: "available" }, Date.now())).toBe(false);
  });

  it("can clear one provider's session health without losing the others", () => {
    useSessionStorage();
    const now = Date.now();
    saveAIProviderHealth({
      gemini: { state: "exhausted", checkedAt: now, note: "Quota", source: "last-response" },
      groq: { state: "available", checkedAt: now, remainingRequests: 100, note: "Requests left", source: "response-headers" },
    });
    clearAIProviderHealth("gemini");
    expect(getAIProviderHealth().gemini).toBeUndefined();
    expect(getAIProviderHealth().groq?.remainingRequests).toBe(100);
  });
});
