const SESSION_KEY_NAME = "sochozara.gemini.api-key";
const MAX_SESSION_KEY_LENGTH = 512;
const FREE_ONLY_CONFIRMATION = "sochozara.gemini.free-only-confirmed";
import { clearAIProviderHealth } from "./ai-provider-health";

/** Stores the user's key only in this tab's session storage, never in project data. */
export function saveGeminiSessionKey(value: string): void {
  const key = value.trim();
  if (!key) throw new Error("Paste your Google AI Studio API key first.");
  if (key.length > MAX_SESSION_KEY_LENGTH) throw new Error("The Gemini API key is too long (maximum 512 characters).");
  try {
    globalThis.sessionStorage.setItem(SESSION_KEY_NAME, key);
    globalThis.sessionStorage.removeItem(FREE_ONLY_CONFIRMATION);
    clearAIProviderHealth("gemini");
  } catch {
    throw new Error("This browser could not save the key for this tab. Enable session storage and try again.");
  }
}

export function getGeminiSessionKey(): string {
  try {
    return globalThis.sessionStorage.getItem(SESSION_KEY_NAME)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function confirmGeminiFreeUseOnly(confirmed: boolean): void {
  try {
    if (confirmed) globalThis.sessionStorage.setItem(FREE_ONLY_CONFIRMATION, "true");
    else globalThis.sessionStorage.removeItem(FREE_ONLY_CONFIRMATION);
  } catch {
    throw new Error("This browser could not save the Gemini free-tier confirmation for this tab.");
  }
}

export function hasGeminiFreeUseOnlyConfirmation(): boolean {
  try {
    return globalThis.sessionStorage.getItem(FREE_ONLY_CONFIRMATION) === "true";
  } catch {
    return false;
  }
}

export function clearGeminiSessionKey(): void {
  try {
    globalThis.sessionStorage.removeItem(SESSION_KEY_NAME);
    globalThis.sessionStorage.removeItem(FREE_ONLY_CONFIRMATION);
    clearAIProviderHealth("gemini");
  } catch {
    // Nothing to clear when browser session storage is unavailable.
  }
}

/** The key is sent only to this app's same-origin Pages Function over HTTPS. */
export function getGeminiSessionHeaders(): Record<string, string> {
  const key = getGeminiSessionKey();
  return {
    ...(key ? { "X-SochoZara-Gemini-Key": key } : {}),
    ...(hasGeminiFreeUseOnlyConfirmation() ? { "X-SochoZara-Gemini-Free-Use": "true" } : {}),
  };
}

export function hasGeminiSessionKey(): boolean {
  return Boolean(getGeminiSessionKey());
}
