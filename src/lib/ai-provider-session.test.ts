import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSecondaryAIKey,
  confirmCloudflareFreeUseOnly,
  confirmGroqFreeUseOnly,
  getSecondaryAIHeaders,
  getSecondaryAIProviderHeaders,
  hasCloudflareFreeUseOnlyConfirmation,
  hasGroqApiKey,
  hasGroqFreeUseOnlyConfirmation,
  hasSecondaryAIKey,
  saveCloudflareAIConnection,
  saveSecondaryAIKey,
} from "./ai-provider-session";

const ACCOUNT_ID = "1234567890abcdef1234567890abcdef";

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
  clearSecondaryAIKey("groq");
  clearSecondaryAIKey("openrouter");
  clearSecondaryAIKey("cloudflare");
  vi.unstubAllGlobals();
});


describe("Groq free-plan consent", () => {
  it("does not send a saved Groq API key until its Free Developer plan is confirmed", () => {
    useSessionStorage();
    saveSecondaryAIKey("groq", "groq-test-token");

    expect(hasGroqApiKey()).toBe(true);
    expect(hasGroqFreeUseOnlyConfirmation()).toBe(false);
    expect(hasSecondaryAIKey("groq")).toBe(false);
    expect(getSecondaryAIHeaders()).toEqual({});
    expect(getSecondaryAIProviderHeaders("groq")).toEqual({ "X-SochoZara-AI-Provider": "groq" });

    confirmGroqFreeUseOnly(true);
    expect(hasSecondaryAIKey("groq")).toBe(true);
    expect(getSecondaryAIHeaders()).toEqual({
      "X-SochoZara-Groq-Key": "groq-test-token",
      "X-SochoZara-Groq-Free-Use": "true",
    });
  });

  it("clears Groq free-use consent when its API key is replaced or removed", () => {
    useSessionStorage();
    saveSecondaryAIKey("groq", "first-token");
    confirmGroqFreeUseOnly(true);
    saveSecondaryAIKey("groq", "replacement-token");
    expect(hasGroqFreeUseOnlyConfirmation()).toBe(false);
    expect(getSecondaryAIHeaders()).toEqual({});

    confirmGroqFreeUseOnly(true);
    clearSecondaryAIKey("groq");
    expect(hasGroqApiKey()).toBe(false);
    expect(hasGroqFreeUseOnlyConfirmation()).toBe(false);
  });
});

describe("Cloudflare Workers AI free-allocation consent", () => {
  it("keeps saved Cloudflare credentials out of requests until the user confirms Workers Free", () => {
    useSessionStorage();
    saveCloudflareAIConnection(ACCOUNT_ID, "cloudflare-test-token");

    expect(hasCloudflareFreeUseOnlyConfirmation()).toBe(false);
    expect(hasSecondaryAIKey("cloudflare")).toBe(false);
    expect(getSecondaryAIHeaders()).toEqual({});
    expect(getSecondaryAIProviderHeaders("cloudflare")).toEqual({
      "X-SochoZara-AI-Provider": "cloudflare",
    });
  });

  it("sends Cloudflare credentials only after the free-allocation confirmation", () => {
    useSessionStorage();
    saveCloudflareAIConnection(ACCOUNT_ID, "cloudflare-test-token");
    confirmCloudflareFreeUseOnly(true);

    expect(hasCloudflareFreeUseOnlyConfirmation()).toBe(true);
    expect(hasSecondaryAIKey("cloudflare")).toBe(true);
    expect(getSecondaryAIHeaders()).toEqual({
      "X-SochoZara-Cloudflare-Token": "cloudflare-test-token",
      "X-SochoZara-Cloudflare-Account": ACCOUNT_ID,
      "X-SochoZara-Cloudflare-Free-Use": "true",
    });
    expect(getSecondaryAIProviderHeaders("cloudflare")).toEqual({
      "X-SochoZara-AI-Provider": "cloudflare",
      "X-SochoZara-Cloudflare-Token": "cloudflare-test-token",
      "X-SochoZara-Cloudflare-Account": ACCOUNT_ID,
      "X-SochoZara-Cloudflare-Free-Use": "true",
    });
  });

  it("resets the free-allocation confirmation when credentials are replaced or removed", () => {
    useSessionStorage();
    saveCloudflareAIConnection(ACCOUNT_ID, "first-token");
    confirmCloudflareFreeUseOnly(true);
    expect(hasSecondaryAIKey("cloudflare")).toBe(true);

    saveCloudflareAIConnection(ACCOUNT_ID, "replacement-token");
    expect(hasCloudflareFreeUseOnlyConfirmation()).toBe(false);
    expect(getSecondaryAIHeaders()).toEqual({});

    confirmCloudflareFreeUseOnly(true);
    clearSecondaryAIKey("cloudflare");
    expect(hasCloudflareFreeUseOnlyConfirmation()).toBe(false);
    expect(getSecondaryAIHeaders()).toEqual({});
  });
});
