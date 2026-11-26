export type SecondaryAIProvider = "groq" | "openrouter" | "cloudflare";
export type AIProvider = "gemini" | SecondaryAIProvider;

export interface SecondaryAIKeys {
  groq?: string;
  openrouter?: string;
  cloudflareApiToken?: string;
  cloudflareAccountId?: string;
  magicHour?: string;
}

const STORAGE = {
  groq: "sochozara.ai.groq-key",
  openrouter: "sochozara.ai.openrouter-key",
  cloudflareApiToken: "sochozara.ai.cloudflare-token",
  cloudflareAccountId: "sochozara.ai.cloudflare-account",
  magicHour: "sochozara.video.magichour-key",
} as const;

const MAX_KEY_LENGTH = 2_048;
const MAX_ACCOUNT_ID_LENGTH = 128;
const MAGIC_HOUR_FREE_CREDITS_CONFIRMATION = "sochozara.video.magichour-free-credits-confirmed";

function read(name: string): string {
  try {
    return globalThis.sessionStorage.getItem(name)?.trim() ?? "";
  } catch {
    return "";
  }
}

function save(name: string, value: string, maxLength = MAX_KEY_LENGTH, label = "API key"): void {
  const clean = value.trim();
  if (!clean) throw new Error("Paste the " + label + " first.");
  if (clean.length > maxLength) throw new Error("The " + label + " is too long.");
  try {
    globalThis.sessionStorage.setItem(name, clean);
  } catch {
    throw new Error("This browser could not save the key for this tab. Enable session storage and try again.");
  }
}

function remove(name: string): void {
  try {
    globalThis.sessionStorage.removeItem(name);
  } catch {
    // Nothing to clear when session storage is unavailable.
  }
}

export function saveMagicHourApiKey(value: string): void {
  save(STORAGE.magicHour, value, MAX_KEY_LENGTH, "Magic Hour API key");
}

export function getMagicHourApiKey(): string {
  return read(STORAGE.magicHour);
}

export function hasMagicHourApiKey(): boolean {
  return Boolean(getMagicHourApiKey());
}

export function clearMagicHourApiKey(): void {
  remove(STORAGE.magicHour);
  remove(MAGIC_HOUR_FREE_CREDITS_CONFIRMATION);
}

export function confirmMagicHourFreeCreditsOnly(confirmed: boolean): void {
  try {
    if (confirmed) globalThis.sessionStorage.setItem(MAGIC_HOUR_FREE_CREDITS_CONFIRMATION, "true");
    else globalThis.sessionStorage.removeItem(MAGIC_HOUR_FREE_CREDITS_CONFIRMATION);
  } catch {
    throw new Error("This browser could not save the free-credit confirmation for this tab.");
  }
}

export function hasMagicHourFreeCreditsOnlyConfirmation(): boolean {
  try {
    return globalThis.sessionStorage.getItem(MAGIC_HOUR_FREE_CREDITS_CONFIRMATION) === "true";
  } catch {
    return false;
  }
}

export function getMagicHourHeaders(): Record<string, string> {
  const key = getMagicHourApiKey();
  return key ? { "X-SochoZara-Magic-Hour-Key": key } : {};
}

export function saveSecondaryAIKey(provider: SecondaryAIProvider, value: string): void {
  if (provider === "groq") save(STORAGE.groq, value, MAX_KEY_LENGTH, "Groq API key");
  else if (provider === "openrouter") save(STORAGE.openrouter, value, MAX_KEY_LENGTH, "OpenRouter API key");
  else throw new Error("Cloudflare requires both an account ID and an API token.");
}

export function saveCloudflareAIConnection(accountId: string, apiToken: string): void {
  const account = accountId.trim();
  if (!account) throw new Error("Enter your Cloudflare account ID.");
  if (account.length > MAX_ACCOUNT_ID_LENGTH || !/^[a-f0-9]+$/i.test(account)) {
    throw new Error("Enter the Cloudflare account ID shown in your dashboard.");
  }
  if (!apiToken.trim()) throw new Error("Paste your Cloudflare Workers AI API token.");
  if (apiToken.trim().length > MAX_KEY_LENGTH) throw new Error("The Cloudflare API token is too long.");
  try {
    globalThis.sessionStorage.setItem(STORAGE.cloudflareAccountId, account);
    globalThis.sessionStorage.setItem(STORAGE.cloudflareApiToken, apiToken.trim());
  } catch {
    throw new Error("This browser could not save the Cloudflare credentials for this tab.");
  }
}

export function getSecondaryAIKeys(): SecondaryAIKeys {
  return {
    groq: read(STORAGE.groq),
    openrouter: read(STORAGE.openrouter),
    cloudflareApiToken: read(STORAGE.cloudflareApiToken),
    cloudflareAccountId: read(STORAGE.cloudflareAccountId),
    magicHour: read(STORAGE.magicHour),
  };
}

export function hasSecondaryAIKey(provider: SecondaryAIProvider): boolean {
  const keys = getSecondaryAIKeys();
  if (provider === "groq") return Boolean(keys.groq);
  if (provider === "openrouter") return Boolean(keys.openrouter);
  return Boolean(keys.cloudflareApiToken && keys.cloudflareAccountId);
}

export function hasAnySecondaryAIKey(): boolean {
  return (["groq", "openrouter", "cloudflare"] as const).some(hasSecondaryAIKey);
}

export function clearSecondaryAIKey(provider: SecondaryAIProvider): void {
  if (provider === "groq") remove(STORAGE.groq);
  else if (provider === "openrouter") remove(STORAGE.openrouter);
  else {
    remove(STORAGE.cloudflareApiToken);
    remove(STORAGE.cloudflareAccountId);
  }
}

/** Credentials leave session storage only in same-origin HTTPS requests to this app's Pages Functions. */
export function getSecondaryAIHeaders(): Record<string, string> {
  const keys = getSecondaryAIKeys();
  const headers: Record<string, string> = {};
  if (keys.groq) headers["X-SochoZara-Groq-Key"] = keys.groq;
  if (keys.openrouter) headers["X-SochoZara-OpenRouter-Key"] = keys.openrouter;
  if (keys.cloudflareApiToken) headers["X-SochoZara-Cloudflare-Token"] = keys.cloudflareApiToken;
  if (keys.cloudflareAccountId) headers["X-SochoZara-Cloudflare-Account"] = keys.cloudflareAccountId;
  return headers;
}

export function getSecondaryAIProviderHeaders(provider: SecondaryAIProvider): Record<string, string> {
  return {
    ...getSecondaryAIHeaders(),
    "X-SochoZara-AI-Provider": provider,
  };
}
