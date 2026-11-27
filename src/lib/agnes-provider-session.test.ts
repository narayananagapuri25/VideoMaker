import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAgnesApiKey,
  confirmAgnesFreeTrialOnly,
  getAgnesConnectionHeaders,
  getAgnesHeaders,
  hasAgnesFreeTrialOnlyConfirmation,
  saveAgnesApiKey,
} from "./ai-provider-session";

function useSessionStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  });
}

afterEach(() => {
  clearAgnesApiKey();
  vi.unstubAllGlobals();
});

describe("Agnes trial key handling", () => {
  it("allows a non-generating connection check without enabling generation", () => {
    useSessionStorage();
    saveAgnesApiKey("agnes-test-key");

    expect(getAgnesConnectionHeaders()).toEqual({ "X-SochoZara-Agnes-Key": "agnes-test-key" });
    expect(getAgnesHeaders()).toEqual({});
    expect(hasAgnesFreeTrialOnlyConfirmation()).toBe(false);
  });

  it("sends a generation credential only after explicit free-trial confirmation", () => {
    useSessionStorage();
    saveAgnesApiKey("agnes-test-key");
    confirmAgnesFreeTrialOnly(true);

    expect(getAgnesHeaders()).toEqual({
      "X-SochoZara-Agnes-Key": "agnes-test-key",
      "X-SochoZara-Agnes-Free-Trial": "true",
    });
  });

  it("clears free-trial consent when the key is removed", () => {
    useSessionStorage();
    saveAgnesApiKey("agnes-test-key");
    confirmAgnesFreeTrialOnly(true);
    clearAgnesApiKey();

    expect(hasAgnesFreeTrialOnlyConfirmation()).toBe(false);
    expect(getAgnesConnectionHeaders()).toEqual({});
    expect(getAgnesHeaders()).toEqual({});
  });
});
