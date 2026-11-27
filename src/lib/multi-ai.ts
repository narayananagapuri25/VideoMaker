import type { AspectRatio, GeneratedStory, Language } from "../types";
import { buildStoryPrompt, generateStoryWithApiKey, parseStory } from "./ai";
import type { AIProvider } from "./ai-provider-session";
import {
  isProviderCoolingDown,
  parseAIProviderHealthHeader,
  type AIProviderHealthEntry,
  type AIProviderHealthMap,
} from "./ai-provider-health";

export interface WorkersAIBinding {
  run(model: string, inputs: Record<string, unknown>, options?: { returnRawResponse?: boolean }): Promise<unknown>;
}

export interface AIProviderCredentials {
  cloudflareAI?: WorkersAIBinding;
  gemini?: string;
  groq?: string;
  openrouter?: string;
  cloudflareApiToken?: string;
  cloudflareAccountId?: string;
}

export interface MultiAIStoryOptions {
  topic: string;
  language: Language;
  targetDuration: number;
  aspectRatio: AspectRatio;
  credentials: AIProviderCredentials;
  providerHealth?: AIProviderHealthMap;
}

export interface MultiAIStoryResult {
  story: GeneratedStory;
  source: AIProvider;
  attempted: AIProvider[];
  fallbackNotice?: string;
  providerHealth: AIProviderHealthMap;
}

const OPENAI_PROVIDER_CONFIG = {
  groq: {
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-120b",
  },
  openrouter: {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "openrouter/free",
  },
} as const;

const CLOUDFLARE_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const REQUEST_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 20_000;
const HEALTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface OpenRouterFreeQuota {
  state: "available" | "exhausted" | "blocked" | "unknown";
  remainingRequests?: number;
  limitRequests?: number;
  retryAt?: number;
  note: string;
}

class ProviderRequestError extends Error {
  readonly status: number;
  readonly retryAt?: number;
  readonly headers: Headers;

  constructor(message: string, status: number, headers: Headers) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
    this.headers = headers;
    this.retryAt = retryAtFromHeaders(headers);
  }
}

function providerName(provider: AIProvider): string {
  if (provider === "gemini") return "Gemini";
  if (provider === "groq") return "Groq";
  if (provider === "openrouter") return "OpenRouter";
  return "Cloudflare Workers AI";
}

function compactError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/\s+/g, " ").trim().slice(0, 400);
}

function nextUtcMidnight(now = Date.now()): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function parseDuration(value: string): number | undefined {
  const clean = value.trim();
  if (!clean) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(clean)) return Number(clean) * 1000;
  const match = clean.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+(?:\.\d+)?)\s*s)?/i);
  if (!match || !match[0].trim()) return undefined;
  const milliseconds = (Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)) * 1000;
  return milliseconds > 0 ? milliseconds : undefined;
}

function retryAtFromHeaders(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const duration = parseDuration(retryAfter);
    if (duration !== undefined) return Date.now() + duration;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return date;
  }
  const reset = headers.get("x-ratelimit-reset-requests") || headers.get("x-ratelimit-reset-tokens");
  if (reset) {
    const duration = parseDuration(reset);
    if (duration !== undefined) return Date.now() + duration;
  }
  return undefined;
}

function retryAtFromMessage(message: string): number | undefined {
  const match = message.match(/retry\s+in\s+((?:\d+\s*h)?\s*(?:\d+\s*m)?\s*(?:\d+(?:\.\d+)?\s*s)?)/i);
  if (!match) return undefined;
  const duration = parseDuration(match[1]);
  return duration === undefined ? undefined : Date.now() + duration;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Request timed out after " + Math.round(timeoutMs / 1000) + " seconds.");
    if (error instanceof TypeError) throw new Error("Network connection to the AI provider failed. Check the provider status and retry.");
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function readError(response: Response): Promise<ProviderRequestError> {
  let detail = "";
  try {
    const text = await response.text();
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        const error = record.error;
        if (typeof error === "string") detail = error;
        else if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") detail = error.message;
        else if (typeof record.message === "string") detail = record.message;
        else detail = text;
      } else detail = text;
    } catch {
      detail = text;
    }
  } catch {
    detail = "No error details were returned.";
  }
  return new ProviderRequestError(
    "HTTP " + response.status + (detail ? " · " + detail.replace(/\s+/g, " ").slice(0, 400) : ""),
    response.status,
    response.headers,
  );
}

function extractChatText(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const record = payload as Record<string, unknown>;
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length) {
    const first = choices[0];
    if (typeof first === "object" && first !== null && "message" in first) {
      const message = (first as Record<string, unknown>).message;
      if (typeof message === "object" && message !== null && "content" in message) {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === "string") return content.trim();
        if (Array.isArray(content)) {
          return content
            .filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null && "text" in part && typeof part.text === "string")
            .map((part) => String(part.text))
            .join("")
            .trim();
        }
      }
    }
  }
  const result = record.result;
  if (typeof result === "object" && result !== null) {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.response === "string") return resultRecord.response.trim();
    if (Array.isArray(resultRecord.choices)) return extractChatText(resultRecord);
  }
  if (typeof record.response === "string") return record.response.trim();
  return "";
}

function storyMessages(prompt: string) {
  return [
    {
      role: "system",
      content: "You are a rigorous documentary writer and storyboard director. Return one valid JSON object only. Do not use Markdown fences. Do not invent facts. Follow the requested schema and scene requirements exactly.",
    },
    { role: "user", content: prompt },
  ];
}

function healthEntry(
  state: AIProviderHealthEntry["state"],
  note: string,
  source: AIProviderHealthEntry["source"],
  extra: Partial<AIProviderHealthEntry> = {},
): AIProviderHealthEntry {
  return { state, note: note.slice(0, 300), source, checkedAt: Date.now(), ...extra };
}

function responseQuota(provider: "groq" | "openrouter", headers: Headers): AIProviderHealthEntry | undefined {
  const readHeaderNumber = (name: string): number | undefined => {
    const raw = headers.get(name);
    if (raw === null || raw.trim() === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const remainingRequests = readHeaderNumber("x-ratelimit-remaining-requests");
  const limitRequests = readHeaderNumber("x-ratelimit-limit-requests");
  const remainingTokens = readHeaderNumber("x-ratelimit-remaining-tokens");
  const limitTokens = readHeaderNumber("x-ratelimit-limit-tokens");
  const retryAt = retryAtFromHeaders(headers);
  const hasRequests = remainingRequests !== undefined;
  const hasTokens = remainingTokens !== undefined;
  if (!hasRequests && !hasTokens) return undefined;
  const state = (hasRequests && remainingRequests === 0) || (hasTokens && remainingTokens === 0) ? "exhausted" : "available";
  return healthEntry(state, provider === "groq"
    ? "Latest Groq response rate-limit headers."
    : "Latest OpenRouter inference response headers.", "response-headers", {
    ...(hasRequests ? { remainingRequests, ...(limitRequests !== undefined ? { limitRequests } : {}) } : {}),
    ...(hasTokens ? { remainingTokens, ...(limitTokens !== undefined ? { limitTokens } : {}) } : {}),
    ...(retryAt ? { retryAt } : {}),
  });
}

function statusFromError(error: unknown): number | undefined {
  if (error instanceof ProviderRequestError) return error.status;
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") return error.status;
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\((4\d\d|5\d\d)\)|HTTP\s+(4\d\d|5\d\d)/i);
  return match ? Number(match[1] || match[2]) : undefined;
}

function errorHealth(provider: AIProvider, error: unknown): AIProviderHealthEntry {
  const status = statusFromError(error);
  const message = compactError(error);
  let retryAt = error instanceof ProviderRequestError ? error.retryAt : undefined;
  if (!retryAt) retryAt = retryAtFromMessage(message);
  if (status === 401 || status === 403) {
    return healthEntry("blocked", "Authentication or permission denied. Check this provider key and account.", "last-response");
  }
  if (status === 429 || /quota|rate.?limit|too many requests|free allocation|daily limit|neurons?/i.test(message)) {
    if (!retryAt) retryAt = provider === "cloudflare" || provider === "openrouter" ? nextUtcMidnight() : undefined;
    return healthEntry("exhausted", "Provider limit reached. Retry after the provider's quota reset.", "last-response", retryAt ? { retryAt } : {});
  }
  if (status === 503 || status && status >= 500 || /temporarily unavailable|overloaded|high demand/i.test(message)) {
    return healthEntry("degraded", "Provider is temporarily unavailable. Retry shortly.", "last-response", {
      retryAt: Date.now() + (status === 503 ? 60_000 : 30_000),
    });
  }
  if (provider === "gemini" && /429/.test(message)) {
    return healthEntry("exhausted", "Gemini quota exhausted. Retry after the provider's quota reset.", "last-response", retryAt ? { retryAt } : {});
  }
  return healthEntry("degraded", "Latest request failed. Check provider status and retry.", "last-response", {
    retryAt: Date.now() + 30_000,
  });
}

function mergeHealth(target: AIProviderHealthMap, provider: AIProvider, entry: AIProviderHealthEntry | undefined): void {
  if (entry) target[provider] = entry;
}

function isExpired(entry: AIProviderHealthEntry | undefined, now = Date.now()): boolean {
  if (!entry) return false;
  if (entry.retryAt !== undefined && entry.retryAt <= now) return true;
  return now - entry.checkedAt > HEALTH_MAX_AGE_MS;
}

async function generateOpenAICompatible(
  provider: "groq" | "openrouter",
  key: string,
  prompt: string,
): Promise<{ story: GeneratedStory; health?: AIProviderHealthEntry }> {
  const config = OPENAI_PROVIDER_CONFIG[provider];
  const response = await fetchWithTimeout(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://videomaker-1mz.pages.dev", "X-Title": "SochoZara Studio" } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: storyMessages(prompt),
      temperature: 0.6,
      max_tokens: 9_000,
      response_format: { type: "json_object" },
      stream: false,
    }),
  }, REQUEST_TIMEOUT_MS);

  if (!response.ok) throw await readError(response);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The provider returned an unreadable response.");
  }
  const text = extractChatText(payload);
  if (!text) throw new Error("The provider completed the request without returning story text.");
  return { story: parseStory(text), health: responseQuota(provider, response.headers) };
}

async function generateCloudflare(
  apiToken: string,
  accountId: string,
  prompt: string,
): Promise<GeneratedStory> {
  const url = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/ai/run/" + CLOUDFLARE_MODEL;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiToken,
    },
    body: JSON.stringify({
      messages: storyMessages(prompt),
      max_tokens: 8_000,
      temperature: 0.6,
    }),
  }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw await readError(response);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Cloudflare Workers AI returned an unreadable response.");
  }
  const text = extractChatText(payload);
  if (!text) throw new Error("Cloudflare Workers AI completed the request without returning story text.");
  return parseStory(text);
}

async function generateCloudflareWithBinding(
  ai: WorkersAIBinding,
  prompt: string,
): Promise<GeneratedStory> {
  const payload = await ai.run(CLOUDFLARE_MODEL, {
    messages: storyMessages(prompt),
    max_tokens: 8_000,
    temperature: 0.6,
  });
  const text = extractChatText(payload);
  if (!text) throw new Error("Cloudflare Workers AI binding completed without returning story text.");
  return parseStory(text);
}

export async function testCloudflareBinding(ai: WorkersAIBinding): Promise<string> {
  const payload = await ai.run(CLOUDFLARE_MODEL, {
    messages: [{ role: "user", content: "Reply exactly: SOCHOZARA_CLOUDFLARE_OK" }],
    max_tokens: 24,
  });
  const text = extractChatText(payload);
  if (!text) throw new Error("The Workers AI binding responded without text. Check its model access.");
  return "Cloudflare Workers AI binding successful · " + CLOUDFLARE_MODEL + ". The test used a small inference request.";
}

function configuredProviders(credentials: AIProviderCredentials): AIProvider[] {
  const providers: AIProvider[] = [];
  if (credentials.gemini?.trim()) providers.push("gemini");
  if (credentials.groq?.trim()) providers.push("groq");
  if (credentials.openrouter?.trim()) providers.push("openrouter");
  if (credentials.cloudflareAI || (credentials.cloudflareApiToken?.trim() && credentials.cloudflareAccountId?.trim())) providers.push("cloudflare");
  return providers;
}

export async function getOpenRouterFreeQuota(key: string): Promise<OpenRouterFreeQuota> {
  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/key", {
    method: "GET",
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
  }, TEST_TIMEOUT_MS);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { state: "blocked", note: "OpenRouter rejected this API key." };
    }
    if (response.status === 429) {
      return { state: "exhausted", retryAt: nextUtcMidnight(), note: "OpenRouter key quota endpoint is rate-limited; retry after the UTC daily reset." };
    }
    return { state: "unknown", note: "OpenRouter quota could not be checked (HTTP " + response.status + ")." };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { state: "unknown", note: "OpenRouter returned an unreadable quota response." };
  }
  if (typeof payload !== "object" || payload === null || !("data" in payload) || typeof payload.data !== "object" || payload.data === null) {
    return { state: "unknown", note: "OpenRouter did not expose a free-model request counter for this key." };
  }
  const data = payload.data as Record<string, unknown>;
  const freeQuota = data.free_model_daily_requests;
  if (typeof freeQuota !== "object" || freeQuota === null) {
    return { state: "unknown", note: "OpenRouter did not expose a free-model request counter for this key." };
  }
  const quota = freeQuota as Record<string, unknown>;
  const remaining = Number(quota.remaining);
  const limit = Number(quota.limit);
  if (!Number.isFinite(remaining) || remaining < 0) {
    return { state: "unknown", note: "OpenRouter returned a free-model quota without a readable remaining count." };
  }
  return {
    state: remaining > 0 ? "available" : "exhausted",
    remainingRequests: remaining,
    ...(Number.isFinite(limit) && limit >= 0 ? { limitRequests: limit } : {}),
    ...(remaining === 0 ? { retryAt: nextUtcMidnight() } : {}),
    note: "Verified from OpenRouter's free-model daily request counter.",
  };
}

export async function generateStoryWithAvailableProviders(
  options: MultiAIStoryOptions,
): Promise<MultiAIStoryResult> {
  const topic = options.topic.trim();
  if (!topic) throw new Error("Enter a topic before generating a story.");
  if (topic.length > 2_000) throw new Error("Keep the video topic under 2,000 characters.");
  if (!Number.isFinite(options.targetDuration) || options.targetDuration < 10 || options.targetDuration > 600) {
    throw new Error("Choose a video duration between 10 seconds and 10 minutes.");
  }

  const credentials = options.credentials;
  const health: AIProviderHealthMap = { ...(options.providerHealth || {}) };
  const providers = configuredProviders(credentials);
  if (!providers.length) {
    const error = new Error("Connect at least one AI provider that is confirmed for free-tier use. Paid routes are disabled.");
    (error as Error & { providerHealth?: AIProviderHealthMap }).providerHealth = health;
    throw error;
  }

  // OpenRouter exposes an account-level free-model counter. Refresh it before
  // each generation; this GET call does not run or consume a model inference.
  if (credentials.openrouter?.trim()) {
    try {
      const quota = await getOpenRouterFreeQuota(credentials.openrouter);
      health.openrouter = healthEntry(quota.state, quota.note, "provider-api", {
        ...(quota.remainingRequests !== undefined ? { remainingRequests: quota.remainingRequests } : {}),
        ...(quota.limitRequests !== undefined ? { limitRequests: quota.limitRequests } : {}),
        ...(quota.retryAt !== undefined ? { retryAt: quota.retryAt } : {}),
      });
    } catch {
      health.openrouter = healthEntry("unknown", "OpenRouter free quota is temporarily unavailable; the free-only route remains provider-limited.", "app");
    }
  }

  const eligible = providers.filter((provider) => {
    const current = health[provider];
    if (!current || isExpired(current)) return true;
    return !isProviderCoolingDown(current);
  });

  const priority: AIProvider[] = ["cloudflare", "gemini", "groq", "openrouter"];
  eligible.sort((left, right) => {
    const a = health[left]?.remainingRequests;
    const b = health[right]?.remainingRequests;
    if (a !== undefined && b !== undefined && a !== b) return b - a;
    if (a !== undefined && b === undefined) return -1;
    if (a === undefined && b !== undefined) return 1;
    return priority.indexOf(left) - priority.indexOf(right);
  });

  const prompt = buildStoryPrompt({
    topic,
    language: options.language,
    targetDuration: options.targetDuration,
    aspectRatio: options.aspectRatio,
  });
  const attempted: AIProvider[] = [];
  const failures: string[] = [];
  const skipped: AIProvider[] = providers.filter((provider) => !eligible.includes(provider));

  for (const provider of eligible) {
    attempted.push(provider);
    try {
      let story: GeneratedStory;
      if (provider === "gemini") {
        const result = await generateStoryWithApiKey({
          topic,
          language: options.language,
          targetDuration: options.targetDuration,
          aspectRatio: options.aspectRatio,
          apiKey: credentials.gemini || "",
        });
        story = result.story;
        health.gemini = healthEntry("available", "Last Gemini request succeeded. Exact remaining quota is not exposed by this API.", "last-response");
      } else if (provider === "groq" || provider === "openrouter") {
        const result = await generateOpenAICompatible(provider, credentials[provider] || "", prompt);
        story = result.story;
        mergeHealth(health, provider, result.health || health[provider] || healthEntry("available", "Last request succeeded; exact free quota is available only when the provider reports it.", "last-response"));
      } else {
        story = credentials.cloudflareAI
          ? await generateCloudflareWithBinding(credentials.cloudflareAI, prompt)
          : await generateCloudflare(credentials.cloudflareApiToken || "", credentials.cloudflareAccountId || "", prompt);
        health.cloudflare = healthEntry("available", "Last Workers AI binding request succeeded. Daily Neuron balance is visible in the Cloudflare dashboard.", "last-response");
      }
      const fallbackNotice = attempted.length > 1 || skipped.length > 0
        ? providerName(provider) + " completed the storyboard after unavailable providers were skipped or failed."
        : undefined;
      return { story, source: provider, attempted, fallbackNotice, providerHealth: health };
    } catch (error) {
      const detail = compactError(error);
      failures.push(providerName(provider) + ": " + detail);
      health[provider] = errorHealth(provider, error);
    }
  }

  const availability = providers.map((provider) => providerName(provider) + ": " + (health[provider]?.note || "availability unknown")).join(" · ");
  const error = new Error("No connected free AI provider could complete the storyboard. " + failures.join(" | ") + (skipped.length ? " Skipped cooling-down providers: " + skipped.map(providerName).join(", ") + "." : "") + " " + availability);
  (error as Error & { providerHealth?: AIProviderHealthMap }).providerHealth = health;
  throw error;
}

export async function getProviderQuotaSnapshot(
  credentials: AIProviderCredentials,
  previous: AIProviderHealthMap = {},
): Promise<AIProviderHealthMap> {
  const snapshot: AIProviderHealthMap = { ...previous };
  if (credentials.openrouter?.trim()) {
    try {
      const quota = await getOpenRouterFreeQuota(credentials.openrouter);
      snapshot.openrouter = healthEntry(quota.state, quota.note, "provider-api", {
        ...(quota.remainingRequests !== undefined ? { remainingRequests: quota.remainingRequests } : {}),
        ...(quota.limitRequests !== undefined ? { limitRequests: quota.limitRequests } : {}),
        ...(quota.retryAt !== undefined ? { retryAt: quota.retryAt } : {}),
      });
    } catch {
      snapshot.openrouter = healthEntry("unknown", "OpenRouter free quota could not be refreshed.", "app");
    }
  } else {
    delete snapshot.openrouter;
  }
  const now = Date.now();
  for (const provider of ["gemini", "groq", "cloudflare"] as const) {
    const configured = provider === "cloudflare"
      ? Boolean(credentials.cloudflareAI || credentials.cloudflareApiToken)
      : Boolean(credentials[provider]);
    if (!configured) {
      delete snapshot[provider];
    } else if (!snapshot[provider] || isExpired(snapshot[provider], now)) {
      snapshot[provider] = healthEntry("unknown", provider === "gemini"
        ? "Google does not expose the remaining Gemini free-tier quota to this app."
        : provider === "groq"
          ? "Groq reports request/token quota in inference response headers; no inference was run during this refresh."
          : "Workers AI binding is configured. Account-wide daily Neuron usage must be checked in the Cloudflare dashboard.", "app");
    }
  }
  return snapshot;
}

async function testOpenAICompatible(provider: "groq" | "openrouter", key: string): Promise<string> {
  if (provider === "openrouter") {
    const quota = await getOpenRouterFreeQuota(key);
    if (quota.state === "blocked") throw new Error(quota.note);
    if (quota.state === "exhausted") return "OpenRouter key is valid, but today's free-model daily request limit is exhausted.";
    if (quota.remainingRequests !== undefined) return "OpenRouter connection successful · " + quota.remainingRequests + " of " + (quota.limitRequests ?? "unknown") + " free-model requests remain today.";
    return "OpenRouter key is valid. Free-model quota visibility is unavailable; generation remains restricted to openrouter/free.";
  }
  const config = OPENAI_PROVIDER_CONFIG[provider];
  const response = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/models",
    { method: "GET", headers: { Authorization: "Bearer " + key } },
    TEST_TIMEOUT_MS,
  );
  if (!response.ok) throw await readError(response);
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("Groq responded, but its model catalogue was not recognised.");
  }
  const models = payload.data as Array<Record<string, unknown>>;
  const modelAvailable = models.some((model) => model.id === config.model);
  if (!modelAvailable) {
    throw new Error("The configured Groq model is not available to this API key. Check the Groq model catalogue.");
  }
  return "Groq connection successful · " + config.model + " is listed. Live request/token capacity will be read from inference response headers.";
}

async function testCloudflare(apiToken: string, accountId: string): Promise<string> {
  const url = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/ai/run/" + CLOUDFLARE_MODEL;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiToken,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Reply exactly: SOCHOZARA_CLOUDFLARE_OK" }],
      max_tokens: 24,
    }),
  }, TEST_TIMEOUT_MS);
  if (!response.ok) throw await readError(response);
  const payload: unknown = await response.json();
  if (!extractChatText(payload)) throw new Error("Cloudflare accepted the request but returned no text.");
  return "Cloudflare Workers AI connection successful · " + CLOUDFLARE_MODEL + ". One small test uses the confirmed Workers Free daily allocation.";
}

export async function testSecondaryAIProvider(
  provider: Exclude<AIProvider, "gemini">,
  credentials: AIProviderCredentials,
): Promise<string> {
  if (provider === "groq") {
    const key = credentials.groq?.trim();
    if (!key) throw new Error("Paste your Groq API key before testing.");
    return testOpenAICompatible("groq", key);
  }
  if (provider === "openrouter") {
    const key = credentials.openrouter?.trim();
    if (!key) throw new Error("Paste your OpenRouter API key before testing.");
    return testOpenAICompatible("openrouter", key);
  }
  if (credentials.cloudflareAI) return testCloudflareBinding(credentials.cloudflareAI);
  const key = credentials.cloudflareApiToken?.trim();
  const account = credentials.cloudflareAccountId?.trim();
  if (!key || !account) throw new Error("The Cloudflare Workers AI binding (AI) is not available to this Pages Function. Check the Pages AI binding in Cloudflare Settings.");
  if (!/^[a-f0-9]{16,64}$/i.test(account)) throw new Error("The Cloudflare account ID must be a hexadecimal ID from your dashboard.");
  return testCloudflare(key, account);
}

export function parseProviderHealthFromRequest(request: Request): AIProviderHealthMap {
  return parseAIProviderHealthHeader(request.headers.get("X-SochoZara-AI-Health"));
}

export function getProviderDisplayName(provider: AIProvider): string {
  return providerName(provider);
}

export function getProviderRetryAtForError(error: unknown): number | undefined {
  const status = statusFromError(error);
  const message = compactError(error);
  if (error instanceof ProviderRequestError && error.retryAt) return error.retryAt;
  const inferred = retryAtFromMessage(message);
  if (inferred) return inferred;
  return status === 429 ? nextUtcMidnight() : undefined;
}
