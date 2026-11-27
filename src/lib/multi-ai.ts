import type { AspectRatio, GeneratedStory, Language } from "../types";
import { buildStoryPrompt, generateStoryWithApiKey, parseStory } from "./ai";
import type { AIProvider } from "./ai-provider-session";

export interface AIProviderCredentials {
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
}

export interface MultiAIStoryResult {
  story: GeneratedStory;
  source: AIProvider;
  attempted: AIProvider[];
  fallbackNotice?: string;
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

async function readError(response: Response): Promise<Error> {
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
  return new Error("HTTP " + response.status + (detail ? " · " + detail.replace(/\s+/g, " ").slice(0, 400) : ""));
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

async function generateOpenAICompatible(
  provider: "groq" | "openrouter",
  key: string,
  prompt: string,
): Promise<GeneratedStory> {
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
  return parseStory(text);
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

function configuredProviders(credentials: AIProviderCredentials): AIProvider[] {
  const providers: AIProvider[] = [];
  if (credentials.gemini?.trim()) providers.push("gemini");
  if (credentials.groq?.trim()) providers.push("groq");
  if (credentials.openrouter?.trim()) providers.push("openrouter");
  if (credentials.cloudflareApiToken?.trim() && credentials.cloudflareAccountId?.trim()) providers.push("cloudflare");
  return providers;
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
  const providers = configuredProviders(options.credentials);
  if (!providers.length) {
    throw new Error("Connect at least one AI provider. Add a Gemini, Groq, OpenRouter or Cloudflare Workers AI key.");
  }

  const prompt = buildStoryPrompt({
    topic,
    language: options.language,
    targetDuration: options.targetDuration,
    aspectRatio: options.aspectRatio,
  });
  const attempted: AIProvider[] = [];
  const failures: string[] = [];

  // A single request uses one provider. The next provider is contacted only if the
  // current one fails, is rate-limited, or cannot return a valid storyboard.
  for (const provider of providers) {
    attempted.push(provider);
    try {
      let story: GeneratedStory;
      if (provider === "gemini") {
        const result = await generateStoryWithApiKey({
          topic,
          language: options.language,
          targetDuration: options.targetDuration,
          aspectRatio: options.aspectRatio,
          apiKey: options.credentials.gemini || "",
        });
        story = result.story;
      } else if (provider === "groq" || provider === "openrouter") {
        story = await generateOpenAICompatible(provider, options.credentials[provider] || "", prompt);
      } else {
        story = await generateCloudflare(
          options.credentials.cloudflareApiToken || "",
          options.credentials.cloudflareAccountId || "",
          prompt,
        );
      }
      const fallbackNotice = attempted.length > 1
        ? "Primary provider unavailable. " + providerName(provider) + " completed the storyboard after " + attempted.slice(0, -1).map(providerName).join(", ") + " failed."
        : undefined;
      return { story, source: provider, attempted, fallbackNotice };
    } catch (error) {
      failures.push(providerName(provider) + ": " + compactError(error));
    }
  }

  throw new Error("No connected AI provider could complete the storyboard. " + failures.join(" | "));
}

async function testOpenAICompatible(provider: "groq" | "openrouter", key: string): Promise<string> {
  const config = OPENAI_PROVIDER_CONFIG[provider];
  const response = await fetchWithTimeout(
    provider === "groq" ? "https://api.groq.com/openai/v1/models" : "https://openrouter.ai/api/v1/models",
    { method: "GET", headers: { Authorization: "Bearer " + key } },
    TEST_TIMEOUT_MS,
  );
  if (!response.ok) throw await readError(response);
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("The provider responded, but its model catalogue was not recognised.");
  }
  const models = payload.data as Array<Record<string, unknown>>;
  const modelAvailable = provider === "groq"
    ? models.some((model) => model.id === config.model)
    : models.some((model) => model.id === "openrouter/free" || model.id === "openrouter/free:free");
  if (provider === "groq" && !modelAvailable) {
    throw new Error("The configured Groq model is not available to this API key. Check the Groq model catalogue.");
  }
  return providerName(provider) + " connection successful. " + (modelAvailable ? "The selected model is listed." : "The account can access the model catalogue.");
}

async function testCloudflare(apiToken: string, accountId: string): Promise<string> {
  const url = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/ai/run/" + CLOUDFLARE_MODEL;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiToken },
    body: JSON.stringify({ messages: [{ role: "user", content: "Reply exactly: SOCHOZARA_CLOUDFLARE_OK" }], max_tokens: 24 }),
  }, TEST_TIMEOUT_MS);
  if (!response.ok) throw await readError(response);
  const payload: unknown = await response.json();
  if (!extractChatText(payload)) throw new Error("Cloudflare accepted the request but returned no text.");
  return "Cloudflare Workers AI connection successful · " + CLOUDFLARE_MODEL + ".";
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
  const key = credentials.cloudflareApiToken?.trim();
  const account = credentials.cloudflareAccountId?.trim();
  if (!key || !account) throw new Error("Enter your Cloudflare account ID and Workers AI API token before testing.");
  if (!/^[a-f0-9]{16,64}$/i.test(account)) throw new Error("The Cloudflare account ID must be a hexadecimal ID from your dashboard.");
  return testCloudflare(key, account);
}

export function getProviderDisplayName(provider: AIProvider): string {
  return providerName(provider);
}
