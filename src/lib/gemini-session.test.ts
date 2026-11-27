import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGeminiSessionKey,
  confirmGeminiFreeUseOnly,
  getGeminiSessionHeaders,
  getGeminiSessionKey,
  hasGeminiFreeUseOnlyConfirmation,
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


  it("only sends an explicit Free Tier confirmation header after consent", () => {
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
    saveGeminiSessionKey("free-key");

    expect(hasGeminiFreeUseOnlyConfirmation()).toBe(false);
    expect(getGeminiSessionHeaders()).toEqual({ "X-SochoZara-Gemini-Key": "free-key" });
    confirmGeminiFreeUseOnly(true);
    expect(getGeminiSessionHeaders()).toEqual({
      "X-SochoZara-Gemini-Key": "free-key",
      "X-SochoZara-Gemini-Free-Use": "true",
    });
  });

  it("resets the Free Tier confirmation whenever the key is replaced", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => values.set(name, value),
      removeItem: (name: string) => { values.delete(name); },
    });
    saveGeminiSessionKey("first-key");
    confirmGeminiFreeUseOnly(true);
    saveGeminiSessionKey("replacement-key");
    expect(hasGeminiFreeUseOnlyConfirmation()).toBe(false);
    expect(getGeminiSessionHeaders()).toEqual({ "X-SochoZara-Gemini-Key": "replacement-key" });
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
