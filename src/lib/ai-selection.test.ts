import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmSelectedAIFreeUseOnly,
  getSelectedAIHeaders,
  hasSelectedAIFreeUseConsent,
  hasSelectedAIKey,
  selectAIProvider,
} from "./ai-selection";

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

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare Workers AI selected-provider session", () => {
  it("requires explicit Workers Free confirmation and then uses only the server-side AI binding", () => {
    useSessionStorage();
    selectAIProvider("cloudflare");
    expect(hasSelectedAIKey("cloudflare")).toBe(false);
    expect(hasSelectedAIFreeUseConsent("cloudflare")).toBe(false);
    expect(getSelectedAIHeaders()).toEqual({ "X-SochoZara-AI-Provider": "cloudflare" });

    confirmSelectedAIFreeUseOnly("cloudflare", true);
    expect(hasSelectedAIKey("cloudflare")).toBe(true);
    expect(hasSelectedAIFreeUseConsent("cloudflare")).toBe(true);
    expect(getSelectedAIHeaders()).toEqual({
      "X-SochoZara-AI-Provider": "cloudflare",
      "X-SochoZara-Cloudflare-Free-Use": "true",
    });

    confirmSelectedAIFreeUseOnly("cloudflare", false);
    expect(hasSelectedAIKey("cloudflare")).toBe(false);
    expect(getSelectedAIHeaders()).toEqual({ "X-SochoZara-AI-Provider": "cloudflare" });
  });
});
