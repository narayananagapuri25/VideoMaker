import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGeminiSessionKey,
  getGeminiSessionHeaders,
  getGeminiSessionKey,
  hasGeminiSessionKey,
  saveGeminiSessionKey,
} from "./gemini-session";

afterEach(() => {
  clearGeminiSessionKey();
  vi.unstubAllGlobals();
});

describe("tab-scoped Gemini key storage", () => {
  it("saves a trimmed key in session storage and supplies it only as a request header", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
      removeItem: (name: string) => { values.delete(name); },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage;
    vi.stubGlobal("sessionStorage", storage);

    saveGeminiSessionKey("  test-session-key  ");

    expect(getGeminiSessionKey()).toBe("test-session-key");
    expect(hasGeminiSessionKey()).toBe(true);
    expect(getGeminiSessionHeaders()).toEqual({ "X-SochoZara-Gemini-Key": "test-session-key" });
  });

  it("rejects an empty or oversized key", () => {
    expect(() => saveGeminiSessionKey("  ")).toThrow(/paste/i);
    expect(() => saveGeminiSessionKey("x".repeat(513))).toThrow(/too long/i);
  });

  it("clears the key from the current tab session", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
      removeItem: (name: string) => { values.delete(name); },
    });
    saveGeminiSessionKey("temporary");
    clearGeminiSessionKey();
    expect(getGeminiSessionKey()).toBe("");
    expect(hasGeminiSessionKey()).toBe(false);
    expect(getGeminiSessionHeaders()).toEqual({});
  });
});
