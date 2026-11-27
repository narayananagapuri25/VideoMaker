export type AIHealthProvider = "gemini" | "groq" | "openrouter" | "cloudflare";
export type AIProviderHealthState = "available" | "exhausted" | "degraded" | "blocked" | "unknown";

export interface AIProviderHealthEntry {
  state: AIProviderHealthState;
  checkedAt: number;
  retryAt?: number;
  remainingRequests?: number;
  limitRequests?: number;
  remainingTokens?: number;
  limitTokens?: number;
  note: string;
  source: "provider-api" | "response-headers" | "last-response" | "app";
}

export type AIProviderHealthMap = Partial<Record<AIHealthProvider, AIProviderHealthEntry>>;

const STORAGE_KEY = "sochozara.ai.provider-health.v1";
export const AI_PROVIDER_HEALTH_EVENT = "sochozara:ai-provider-health";
const PROVIDERS: AIHealthProvider[] = ["gemini", "groq", "openrouter", "cloudflare"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanEntry(value: unknown): AIProviderHealthEntry | null {
  if (!isRecord(value)) return null;
  const states: AIProviderHealthState[] = ["available", "exhausted", "degraded", "blocked", "unknown"];
  const sources: AIProviderHealthEntry["source"][] = ["provider-api", "response-headers", "last-response", "app"];
  if (!states.includes(value.state as AIProviderHealthState) || !sources.includes(value.source as AIProviderHealthEntry["source"])) return null;
  const checkedAt = Number(value.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt <= 0) return null;
  const entry: AIProviderHealthEntry = {
    state: value.state as AIProviderHealthState,
    checkedAt,
    note: typeof value.note === "string" ? value.note.slice(0, 300) : "",
    source: value.source as AIProviderHealthEntry["source"],
  };
  for (const key of ["retryAt", "remainingRequests", "limitRequests", "remainingTokens", "limitTokens"] as const) {
    const number = Number(value[key]);
    if (value[key] !== undefined && Number.isFinite(number) && number >= 0) entry[key] = number;
  }
  return entry;
}

export function parseAIProviderHealthHeader(raw: string | null | undefined): AIProviderHealthMap {
  if (!raw || raw.length > 2_500) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const result: AIProviderHealthMap = {};
    for (const provider of PROVIDERS) {
      const entry = cleanEntry(parsed[provider]);
      if (entry && Date.now() - entry.checkedAt < 7 * 24 * 60 * 60 * 1000) result[provider] = entry;
    }
    return result;
  } catch {
    return {};
  }
}

export function getAIProviderHealth(): AIProviderHealthMap {
  try {
    const raw = globalThis.sessionStorage.getItem(STORAGE_KEY);
    const parsed = parseAIProviderHealthHeader(raw);
    return parsed;
  } catch {
    return {};
  }
}

export function saveAIProviderHealth(updates: AIProviderHealthMap): void {
  const current = getAIProviderHealth();
  for (const provider of PROVIDERS) {
    if (updates[provider]) current[provider] = cleanEntry(updates[provider]) ?? undefined;
  }
  try {
    globalThis.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Availability is best-effort; the current generation still works without browser storage.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_PROVIDER_HEALTH_EVENT));
}

export function clearAIProviderHealth(provider?: AIHealthProvider): void {
  const current = getAIProviderHealth();
  if (provider) delete current[provider];
  else {
    for (const key of PROVIDERS) delete current[key];
  }
  try {
    if (Object.keys(current).length) globalThis.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    else globalThis.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when tab storage is unavailable.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_PROVIDER_HEALTH_EVENT));
}

export function getAIProviderHealthHeader(): Record<string, string> {
  const health = getAIProviderHealth();
  return Object.keys(health).length
    ? { "X-SochoZara-AI-Health": JSON.stringify(health).slice(0, 2_500) }
    : {};
}

export function isProviderCoolingDown(entry: AIProviderHealthEntry | undefined, now = Date.now()): boolean {
  if (!entry) return false;
  if (entry.state === "blocked") return true;
  if (entry.state !== "exhausted" && entry.state !== "degraded") return false;
  return entry.retryAt === undefined || entry.retryAt > now;
}
