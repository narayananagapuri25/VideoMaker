import {
  clearSecondaryAIKey,
  confirmGroqFreeUseOnly,
  getSecondaryAIProviderHeaders,
  hasGroqFreeUseOnlyConfirmation,
  hasSecondaryAIKey,
  confirmCloudflareFreeUseOnly,
  saveSecondaryAIKey,
  type SecondaryAIProvider,
} from "./ai-provider-session";
import {
  clearGeminiSessionKey,
  confirmGeminiFreeUseOnly,
  getGeminiSessionHeaders,
  hasGeminiFreeUseOnlyConfirmation,
  hasGeminiSessionKey,
  saveGeminiSessionKey,
} from "./gemini-session";

export type SelectedAIProvider = "gemini" | "groq" | "openrouter" | "cloudflare";

const SELECTED_PROVIDER_KEY = "sochozara.ai.selected-provider";

function validProvider(value: string | null): value is SelectedAIProvider {
  return value === "gemini" || value === "groq" || value === "openrouter" || value === "cloudflare";
}

export function getSelectedAIProvider(): SelectedAIProvider {
  try {
    const stored = globalThis.sessionStorage.getItem(SELECTED_PROVIDER_KEY);
    return validProvider(stored) ? stored : "gemini";
  } catch {
    return "gemini";
  }
}

export function selectAIProvider(provider: SelectedAIProvider): void {
  // Keep only the selected provider credential in the tab session.
  if (provider !== "gemini") clearGeminiSessionKey();
  if (provider !== "groq") clearSecondaryAIKey("groq");
  if (provider !== "openrouter") clearSecondaryAIKey("openrouter");
  if (provider !== "cloudflare") clearSecondaryAIKey("cloudflare");
  try {
    globalThis.sessionStorage.setItem(SELECTED_PROVIDER_KEY, provider);
  } catch {
    throw new Error("This browser could not save your AI selection for this tab.");
  }
}

export function hasSelectedAIKey(provider: SelectedAIProvider = getSelectedAIProvider()): boolean {
  if (provider === "gemini") return hasGeminiSessionKey();
  if (provider === "groq") return hasSecondaryKey("groq");
  if (provider === "cloudflare") return hasSecondaryAIKey("cloudflare");
  return hasSecondaryKey("openrouter");
}

function hasSecondaryKey(provider: SecondaryAIProvider): boolean {
  try {
    return Boolean(globalThis.sessionStorage.getItem(provider === "groq" ? "sochozara.ai.groq-key" : "sochozara.ai.openrouter-key")?.trim());
  } catch {
    return false;
  }
}

export function hasSelectedAIFreeUseConsent(provider: SelectedAIProvider = getSelectedAIProvider()): boolean {
  if (provider === "gemini") return hasGeminiFreeUseOnlyConfirmation();
  if (provider === "groq") return hasGroqFreeUseOnlyConfirmation();
  if (provider === "cloudflare") return hasSecondaryAIKey("cloudflare");
  return true;
}

export function confirmSelectedAIFreeUseOnly(provider: SelectedAIProvider, confirmed: boolean): void {
  if (provider === "gemini") confirmGeminiFreeUseOnly(confirmed);
  else if (provider === "groq") confirmGroqFreeUseOnly(confirmed);
  else if (provider === "cloudflare") confirmCloudflareFreeUseOnly(confirmed);
}

export function saveSelectedAIKey(provider: SelectedAIProvider, key: string): void {
  const value = key.trim();
  if (!value) throw new Error("Paste your API key first.");

  // Keep exactly one provider credential in this tab. No provider can be used
  // as an automatic fallback when the selected provider is unavailable.
  clearGeminiSessionKey();
  clearSecondaryAIKey("groq");
  clearSecondaryAIKey("openrouter");
  clearSecondaryAIKey("cloudflare");

  if (provider === "gemini") saveGeminiSessionKey(value);
  else saveSecondaryAIKey(provider, value);
  selectAIProvider(provider);
}

export function removeSelectedAIKey(provider: SelectedAIProvider = getSelectedAIProvider()): void {
  if (provider === "gemini") clearGeminiSessionKey();
  else if (provider === "cloudflare") confirmCloudflareFreeUseOnly(false);
  else clearSecondaryAIKey(provider);
}

export function getSelectedAIHeaders(): Record<string, string> {
  const provider = getSelectedAIProvider();
  if (provider === "gemini") {
    return { "X-SochoZara-AI-Provider": provider, ...getGeminiSessionHeaders() };
  }
  return getSecondaryAIProviderHeaders(provider);
}
