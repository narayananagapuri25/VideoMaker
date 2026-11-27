import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearReplicateApiToken,
  confirmReplicateTryForFreeOnly,
  getReplicateConnectionHeaders,
  getReplicateHeaders,
  hasReplicateTryForFreeConfirmation,
  saveReplicateApiToken,
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
  clearReplicateApiToken();
  vi.unstubAllGlobals();
});

describe("Replicate Try-for-Free token handling", () => {
  it("allows model access tests but withholds generation credentials until opt-in", () => {
    useSessionStorage();
    saveReplicateApiToken("replicate-test-token");

    expect(getReplicateConnectionHeaders()).toEqual({
      "X-SochoZara-Replicate-Key": "replicate-test-token",
    });
    expect(getReplicateHeaders()).toEqual({});
    expect(hasReplicateTryForFreeConfirmation()).toBe(false);
  });

  it("sends the API token for generation only after explicit Try-for-Free confirmation", () => {
    useSessionStorage();
    saveReplicateApiToken("replicate-test-token");
    confirmReplicateTryForFreeOnly(true);

    expect(getReplicateHeaders()).toEqual({
      "X-SochoZara-Replicate-Key": "replicate-test-token",
      "X-SochoZara-Replicate-Try-Free": "true",
    });
  });

  it("resets Try-for-Free consent when a token is replaced or removed", () => {
    useSessionStorage();
    saveReplicateApiToken("first-token");
    confirmReplicateTryForFreeOnly(true);
    expect(hasReplicateTryForFreeConfirmation()).toBe(true);

    saveReplicateApiToken("replacement-token");
    expect(hasReplicateTryForFreeConfirmation()).toBe(false);
    expect(getReplicateHeaders()).toEqual({});

    confirmReplicateTryForFreeOnly(true);
    clearReplicateApiToken();
    expect(hasReplicateTryForFreeConfirmation()).toBe(false);
    expect(getReplicateConnectionHeaders()).toEqual({});
  });
});
