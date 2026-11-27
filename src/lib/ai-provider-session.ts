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
  agnes: "sochozara.video.agnes-key",
  replicate: "sochozara.video.replicate-key",
} as const;

const MAX_KEY_LENGTH = 2_048;
const MAX_ACCOUNT_ID_LENGTH = 128;
const MAGIC_HOUR_FREE_CREDITS_CONFIRMATION = "sochozara.video.magichour-free-credits-confirmed";
const CLOUDFLARE_FREE_ONLY_CONFIRMATION = "sochozara.ai.cloudflare-free-only-confirmed";
const AGNES_FREE_TRIAL_CONFIRMATION = "sochozara.video.agnes-free-trial-confirmed";
const REPLICATE_TRY_FOR_FREE_CONFIRMATION = "sochozara.video.replicate-try-free-confirmed";

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

export function saveAgnesApiKey(value: string): void {
  save(STORAGE.agnes, value, MAX_KEY_LENGTH, "Agnes AI API key");
  remove(AGNES_FREE_TRIAL_CONFIRMATION);
}

export function getAgnesApiKey(): string {
  return read(STORAGE.agnes);
}

export function hasAgnesApiKey(): boolean {
  return Boolean(getAgnesApiKey());
}

export function clearAgnesApiKey(): void {
  remove(STORAGE.agnes);
  remove(AGNES_FREE_TRIAL_CONFIRMATION);
}

export function confirmAgnesFreeTrialOnly(confirmed: boolean): void {
  try {
    if (confirmed) globalThis.sessionStorage.setItem(AGNES_FREE_TRIAL_CONFIRMATION, "true");
    else globalThis.sessionStorage.removeItem(AGNES_FREE_TRIAL_CONFIRMATION);
  } catch {
    throw new Error("This browser could not save the Agnes free-trial confirmation for this tab.");
  }
}

export function hasAgnesFreeTrialOnlyConfirmation(): boolean {
  try {
    return globalThis.sessionStorage.getItem(AGNES_FREE_TRIAL_CONFIRMATION) === "true";
  } catch {
    return false;
  }
}

/** Agnes keys are sent only after an explicit current $0 Angel User Trial confirmation. */
export function getAgnesConnectionHeaders(): Record<string, string> {
  const key = getAgnesApiKey();
  return key ? { "X-SochoZara-Agnes-Key": key } : {};
}

export function getAgnesHeaders(): Record<string, string> {
  const key = getAgnesApiKey();
  if (!key || !hasAgnesFreeTrialOnlyConfirmation()) return {};
  return {
    "X-SochoZara-Agnes-Key": key,
    "X-SochoZara-Agnes-Free-Trial": "true",
  };
}

export function saveReplicateApiToken(value: string): void {
  save(STORAGE.replicate, value, MAX_KEY_LENGTH, "Replicate API token");
  remove(REPLICATE_TRY_FOR_FREE_CONFIRMATION);
}

export function getReplicateApiToken(): string {
  return read(STORAGE.replicate);
}

export function hasReplicateApiToken(): boolean {
  return Boolean(getReplicateApiToken());
}

export function clearReplicateApiToken(): void {
  remove(STORAGE.replicate);
  remove(REPLICATE_TRY_FOR_FREE_CONFIRMATION);
}

export function confirmReplicateTryForFreeOnly(confirmed: boolean): void {
  try {
    if (confirmed) globalThis.sessionStorage.setItem(REPLICATE_TRY_FOR_FREE_CONFIRMATION, "true");
    else globalThis.sessionStorage.removeItem(REPLICATE_TRY_FOR_FREE_CONFIRMATION);
  } catch {
    throw new Error("This browser could not save the Replicate free-run confirmation for this tab.");
  }
}

export function hasReplicateTryForFreeConfirmation(): boolean {
  try {
    return globalThis.sessionStorage.getItem(REPLICATE_TRY_FOR_FREE_CONFIRMATION) === "true";
  } catch {
    return false;
  }
}

export function getReplicateConnectionHeaders(): Record<string, string> {
  const key = getReplicateApiToken();
  return key ? { "X-SochoZara-Replicate-Key": key } : {};
}

/** Replicate's limited free-run credential is never sent until the user opts in to Try-for-Free only. */
export function getReplicateHeaders(): Record<string, string> {
  const key = getReplicateApiToken();
  if (!key || !hasReplicateTryForFreeConfirmation()) return {};
  return {
    "X-SochoZara-Replicate-Key": key,
    "X-SochoZara-Replicate-Try-Free": "true",
  };
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
  if (!key) return {};
  return {
    "X-SochoZara-Magic-Hour-Key": key,
    ...(hasMagicHourFreeCreditsOnlyConfirmation()
      ? { "X-SochoZara-Magic-Hour-Free-Use": "true" }
      : {}),
  };
}

export function saveSecondaryAIKey(provider: SecondaryAIProvider, value: string): void {
  if (provider === "groq") save(STORAGE.groq, value, MAX_KEY_LENGTH, "Groq API key");
  else if (provider === "openrouter") save(STORAGE.openrouter, value, MAX_KEY_LENGTH, "OpenRouter API key");
  else throw new Error("Cloudflare requires both an account ID and an API token.");
}

export function hasCloudflareAIKey(): boolean {
  const keys = getSecondaryAIKeys();
  return Boolean(keys.cloudflareApiToken && keys.cloudflareAccountId);
}

export function confirmCloudflareFreeUseOnly(confirmed: boolean): void {
  try {
    if (confirmed) globalThis.sessionStorage.setItem(CLOUDFLARE_FREE_ONLY_CONFIRMATION, "true");
    else globalThis.sessionStorage.removeItem(CLOUDFLARE_FREE_ONLY_CONFIRMATION);
  } catch {
    throw new Error("This browser could not save the Cloudflare free-plan confirmation for this tab.");
  }
}

export function hasCloudflareFreeUseOnlyConfirmation(): boolean {
  try {
    return globalThis.sessionStorage.getItem(CLOUDFLARE_FREE_ONLY_CONFIRMATION) === "true";
  } catch {
    return false;
  }
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
    globalThis.sessionStorage.removeItem(CLOUDFLARE_FREE_ONLY_CONFIRMATION);
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
  return Boolean(keys.cloudflareApiToken && keys.cloudflareAccountId && hasCloudflareFreeUseOnlyConfirmation());
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
    remove(CLOUDFLARE_FREE_ONLY_CONFIRMATION);
  }
}

/** Credentials leave session storage only in same-origin HTTPS requests to this app's Pages Functions. */
export function getSecondaryAIHeaders(): Record<string, string> {
  const keys = getSecondaryAIKeys();
  const headers: Record<string, string> = {};
  if (keys.groq) headers["X-SochoZara-Groq-Key"] = keys.groq;
  if (keys.openrouter) headers["X-SochoZara-OpenRouter-Key"] = keys.openrouter;
  if (keys.cloudflareApiToken && keys.cloudflareAccountId && hasCloudflareFreeUseOnlyConfirmation()) {
    headers["X-SochoZara-Cloudflare-Token"] = keys.cloudflareApiToken;
    headers["X-SochoZara-Cloudflare-Account"] = keys.cloudflareAccountId;
    headers["X-SochoZara-Cloudflare-Free-Use"] = "true";
  }
  return headers;
}

export function getSecondaryAIProviderHeaders(provider: SecondaryAIProvider): Record<string, string> {
  const keys = getSecondaryAIKeys();
  const headers: Record<string, string> = { "X-SochoZara-AI-Provider": provider };
  if (provider === "groq" && keys.groq) headers["X-SochoZara-Groq-Key"] = keys.groq;
  if (provider === "openrouter" && keys.openrouter) headers["X-SochoZara-OpenRouter-Key"] = keys.openrouter;
  if (provider === "cloudflare" && keys.cloudflareApiToken && keys.cloudflareAccountId && hasCloudflareFreeUseOnlyConfirmation()) {
    headers["X-SochoZara-Cloudflare-Token"] = keys.cloudflareApiToken;
    headers["X-SochoZara-Cloudflare-Account"] = keys.cloudflareAccountId;
    headers["X-SochoZara-Cloudflare-Free-Use"] = "true";
  }
  return headers;
}
