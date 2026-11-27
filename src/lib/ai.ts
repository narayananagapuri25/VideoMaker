import type { AspectRatio, GeneratedStory, Language, SceneVisualLayout, SceneVisualPlan, TrendEditorialContext, VideoGenre } from "../types";
import { getSelectedAIHeaders } from "./ai-selection";
import { getGeminiSessionHeaders } from "./gemini-session";
import type { AIProvider } from "./ai-provider-session";
import { getAIProviderHealthHeader, saveAIProviderHealth, type AIProviderHealthMap } from "./ai-provider-health";

interface GenerateOptions {
  topic: string;
  language: Language;
  targetDuration: number;
  aspectRatio: AspectRatio;
  apiKey: string;
  genre?: VideoGenre;
  trendContext?: TrendEditorialContext;
}

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_TEXT_MODEL = "gemini-4-hydrogen";
const GEMINI_API_REVISION = "2026-05-20";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_SCENES = 12;
const MAX_TOPIC_LENGTH = 2_000;
const MAX_SCRIPT_LENGTH = 60_000;

const STORY_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    script: { type: "string" },
    editorialNote: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          narration: { type: "string" },
          caption: { type: "string" },
          visualPrompt: { type: "string" },
          visualPlan: {
            type: "object",
            properties: {
              layout: { type: "string", enum: ["hero", "illustration", "chart", "candlestick", "dashboard", "process", "comparison", "timeline", "diagram", "infographic"] },
              subject: { type: "string" },
              headline: { type: "string" },
              labels: { type: "array", items: { type: "string" } },
              steps: { type: "array", items: { type: "string" } },
              values: { type: "array", items: { type: "number" } },
              trend: { type: "string", enum: ["up", "down", "volatile", "flat"] },
              note: { type: "string" },
            },
            required: ["layout", "subject", "headline", "labels", "steps", "values", "trend", "note"],
          },
          duration: { type: "number" },
        },
        required: ["title", "narration", "caption", "visualPrompt", "visualPlan", "duration"],
      },
    },
  },
  required: ["title", "script", "editorialNote", "scenes"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number, label: string, allowEmpty = true): string {
  if (typeof value !== "string") throw new Error("The AI response contained an invalid " + label + ".");
  const text = value.trim();
  if (text.length > maxLength) throw new Error("The AI response " + label + " is too long.");
  if (!allowEmpty && !text) throw new Error("The AI response did not contain " + label + ".");
  return text;
}

const VISUAL_LAYOUTS: SceneVisualLayout[] = [
  "hero", "illustration", "chart", "candlestick", "dashboard",
  "process", "comparison", "timeline", "diagram", "infographic",
];

function boundedStringArray(value: unknown, maxItems: number, maxLength: number, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("The AI response contained invalid " + label + ".");
  return value.slice(0, maxItems).map((item, index) =>
    boundedText(item, maxLength, label + " item " + (index + 1), false),
  );
}

function parseVisualPlan(value: unknown, visualPrompt: string, title: string): SceneVisualPlan {
  if (!isRecord(value)) return { layout: "illustration", subject: visualPrompt || title, headline: title };
  const rawLayout = boundedText(value.layout ?? "illustration", 32, "visual layout");
  const layout = VISUAL_LAYOUTS.includes(rawLayout as SceneVisualLayout) ? rawLayout as SceneVisualLayout : "illustration";
  const rawTrend = boundedText(value.trend ?? "flat", 16, "visual trend");
  const trend = rawTrend === "up" || rawTrend === "down" || rawTrend === "volatile" ? rawTrend : "flat";
  const values = Array.isArray(value.values)
    ? value.values.slice(0, 8).map((item) => {
        const number = Number(item);
        return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 50;
      })
    : [];
  return {
    layout,
    subject: boundedText(value.subject ?? visualPrompt ?? title, 320, "visual subject", false),
    headline: boundedText(value.headline ?? title, 120, "visual headline"),
    labels: boundedStringArray(value.labels, 5, 64, "visual labels"),
    steps: boundedStringArray(value.steps, 5, 80, "visual steps"),
    values,
    trend,
    note: boundedText(value.note ?? "", 180, "visual note"),
  };
}

export function parseStory(text: string): GeneratedStory {
  const fence = String.fromCharCode(96).repeat(3);
  const cleaned = text.trim()
    .replace(new RegExp("^\\s*" + fence + "(?:json)?\\s*", "i"), "")
    .replace(new RegExp("\\s*" + fence + "\\s*$"), "");
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error("The AI provider returned invalid JSON. Please retry the generation.");
  }
  if (!isRecord(value) || !Array.isArray(value.scenes) || value.scenes.length < 2 || value.scenes.length > MAX_SCENES) {
    throw new Error("The AI response did not contain a complete storyboard with 2 to 12 scenes.");
  }

  const title = boundedText(value.title, 240, "video title", false);
  const script = boundedText(value.script, MAX_SCRIPT_LENGTH, "script", false);
  const scenes = value.scenes.map((entry, index) => {
    if (!isRecord(entry)) throw new Error("The AI response contains an invalid scene at position " + (index + 1) + ".");
    const narration = boundedText(entry.narration, 12_000, "scene narration");
    const caption = boundedText(entry.caption ?? narration, 3_000, "scene caption");
    const rawDuration = Number(entry.duration);
    const duration = Number.isFinite(rawDuration) ? Math.max(1, Math.min(90, rawDuration)) : 5;
    const title = boundedText(entry.title ?? "Scene " + (index + 1), 200, "scene title", false);
    const visualPrompt = boundedText(entry.visualPrompt ?? "", 6_000, "visual prompt");
    return {
      title,
      narration,
      caption: caption || narration,
      visualPrompt,
      visualPlan: parseVisualPlan(entry.visualPlan, visualPrompt, title),
      duration,
    };
  });
  const editorialNote = value.editorialNote === undefined
    ? undefined
    : boundedText(value.editorialNote, 8_000, "editorial note");
  return { title, script, scenes, editorialNote };
}

function getProviderMessage(raw: string): string {
  try {
    const payload: unknown = JSON.parse(raw);
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message.slice(0, 500);
    }
  } catch {
    // Some gateways return plain-text errors instead of Google's JSON shape.
  }
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

function explainProviderError(status: number, detail: string): string {
  const message = getProviderMessage(detail);
  if (status === 400) {
    return "Gemini rejected the story request (400). Check the request or selected model and retry. " + message;
  }
  if (status === 401) {
    return "Gemini rejected the API key (401). Create or copy an active key from Google AI Studio and paste it without spaces. " + message;
  }
  if (status === 403) {
    return "Gemini denied API access (403). Check that the key's Google project is enabled and eligible for Gemini API access/free-tier use. " + message;
  }
  if (status === 404) {
    return "Gemini could not find the requested model or endpoint (404). Check model availability for this API project. " + message;
  }
  if (status === 429) {
    return "Gemini quota or rate limit reached (429). Check AI Studio usage limits and try again later. " + message;
  }
  if (status >= 500) {
    return "Gemini is temporarily unavailable (" + status + "). Please retry shortly. " + message;
  }
  return "Gemini request failed (" + status + "): " + message;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Gemini did not respond within " + Math.round(timeoutMs / 1000) + " seconds. Please retry.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not connect to Gemini from this browser. Check your internet connection, VPN or content blocker, then retry.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function extractInteractionText(payload: unknown): string {
  if (!isRecord(payload)) return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  if (!Array.isArray(payload.steps)) return "";

  return payload.steps
    .filter((step): step is Record<string, unknown> => isRecord(step) && step.type === "model_output")
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
}

/**
 * Runs a minimal, stateless request so creators can verify API connectivity,
 * model access and the API key without sending their video topic or script.
 */
export async function testGeminiConnectionWithApiKey(apiKey: string): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error("Paste your Google AI Studio API key before testing Gemini.");

  const response = await fetchWithTimeout(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
      "Api-Revision": GEMINI_API_REVISION,
    },
    body: JSON.stringify({
      model: GEMINI_TEXT_MODEL,
      input: "Reply with exactly this text: SOCHOZARA_GEMINI_OK",
      store: false,
    }),
  }, 45_000);

  if (!response.ok) {
    throw new Error(explainProviderError(response.status, await response.text()));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Gemini accepted the connection check but returned an unreadable response.");
  }

  const text = extractInteractionText(payload);
  if (!text) {
    const state = isRecord(payload) && typeof payload.status === "string" ? payload.status : "unknown";
    throw new Error("Gemini responded but returned no text (status: " + state + "). Check the model access and retry.");
  }
  return "Gemini connection successful · " + GEMINI_TEXT_MODEL + ". Your API key and project can reach the model.";
}

export interface StoryPromptOptions {
  topic: string;
  language: Language;
  targetDuration: number;
  aspectRatio: AspectRatio;
  genre?: VideoGenre;
  trendContext?: TrendEditorialContext;
}

const GENRE_GUIDANCE: Record<VideoGenre, string> = {
  auto: "Infer the best genre from the subject and use the most natural editorial form.",
  documentary: "Use an evidence-led documentary arc, strong atmosphere, context and a meaningful conclusion.",
  explainer: "Teach one concept at a time with clear analogies, process diagrams and accessible language.",
  news: "Use a careful current-affairs explainer structure. Separate confirmed facts, context and uncertainty; do not present allegations as facts.",
  technology: "Show real-world use cases, systems, interfaces, engineering details and consequences rather than generic glowing circuits.",
  business: "Explain the market, customers, operations, competition and business model with grounded examples.",
  finance: "Use accurate financial education visuals such as cash flows, market structure and risk. Never invent live prices or returns.",
  sports: "Build an energetic match or athlete-performance story with action, tactics, training and context. Do not invent scores or statistics.",
  entertainment: "Use cinematic scene variety, culture, release context and audience impact without inventing celebrity quotes or private facts.",
  history: "Use a chronological arc, maps, period-specific environments and clearly labelled artistic reconstructions.",
  science: "Explain mechanisms and evidence with accurate scale, experiment, diagram and observation visuals.",
  travel: "Use a destination-led journey with geography, transport, landscape, local culture and practical context.",
  food: "Use appetising close-ups, ingredients, preparation stages, textures and regional context.",
  health: "Use cautious evidence-led education, anatomy/process visuals and clear limits; do not diagnose or promise outcomes.",
  education: "Use a progressive lesson structure, worked examples, diagrams and recap.",
  mystery: "Build curiosity through clues, timeline and competing explanations; distinguish documented evidence from speculation.",
  biography: "Use a respectful life timeline, formative events, work and legacy; do not invent private scenes or quotations.",
  nature: "Use species, habitats, behaviour, ecosystems and environmental context with natural-history imagery.",
  storytelling: "Use a clear narrative arc, vivid settings, emotional pacing and a memorable resolution."
};

export function buildStoryPrompt(options: StoryPromptOptions): string {
  const { topic, language, targetDuration, aspectRatio, genre = "auto", trendContext } = options;
  const trendLines = trendContext ? [
    "Trend discovery context: Google Trends " + trendContext.region + " · approximate search traffic " + trendContext.traffic + " · feed date " + trendContext.publishedAt + ".",
    "Related headline leads (not independently verified facts):",
    ...trendContext.relatedNews.slice(0, 3).map((item) => "- " + item.title + (item.source ? " · " + item.source : "")),
    "Treat these headlines as research leads only. Do not copy headline claims as facts. If a current claim is not supported by the supplied material or reliable stable knowledge, mark it [VERIFY] and explain in editorialNote. Do not imply that this model browsed or independently confirmed the latest event."
  ] : [];
  return [
    "You are the complete AI documentary production team for SochoZara: research-minded explainer, scriptwriter, storyboard director, information designer and motion-graphics art director.",
    "Create a genuinely topic-specific video package for this question: " + topic,
    "Language: " + language + ". Approximate video duration: " + targetDuration + " seconds. Aspect ratio: " + aspectRatio + ".",
    "Genre: " + genre + ". Genre direction: " + GENRE_GUIDANCE[genre] + ".",
    ...trendLines,
    "First determine the core concepts a viewer must understand, then create a compelling hook, a coherent beginning-middle-end explanation and a memorable takeaway.",
    "Write a complete, fact-conscious narration and divide it into 4 to 8 scenes. Each scene must teach a distinct idea and collectively cover the whole script without unrelated filler.",
    "For EVERY scene, act as a visual director. Do not write generic prompts such as 'cinematic background' or repeat the same visual. Choose the most useful layout from hero, illustration, chart, candlestick, dashboard, process, comparison, timeline, diagram or infographic. Vary adjacent scenes when appropriate.",
    "The visualPlan must tell the local renderer exactly what to draw: layout, subject, short headline, 2 to 5 concise labels and up to 5 ordered steps. Include 4 to 8 normalised values from 0 to 100 only when a chart needs visual shape. Values are illustrative geometry, never factual prices, returns or measurements.",
    "For finance topics, create recognisable stock-market teaching visuals: company ownership/share slices, primary-market IPO process, buyer/seller order matching, demand-versus-supply, candlestick anatomy, index dashboards and risk/diversification diagrams. Never invent current share prices, returns or financial statistics. Mark conceptual charts and candle patterns as illustrative, not live data.",
    "For petrol, fuel, crude-oil and energy-price topics, build a traceable supply-chain explanation: oilfield and extraction, benchmark crude and global shipping, refining, currency conversion, taxes and local retail delivery. Use relevant imagery such as pumpjacks, tankers, refinery units, storage depots, fuel pumps and real roads instead of abstract planets or generic atom graphics. Explain the distinction between global crude prices and the final local pump price. Never invent current petrol prices, tax rates, exchange rates, component percentages or a live price trend; use sourced figures or clearly label the breakdown as conceptual and illustrative.",
    "For science, history, geography, business, sport, entertainment, travel, food, biographies, health, nature and other topics, choose matching bespoke visuals. Use action framing for sport, authentic locations for travel, macro food details, archival-style timelines for history, product/process close-ups for business and technology, and natural behaviour for wildlife. The visualPlan must describe the subject in this scene, not merely repeat the topic name.",
    "Avoid repetitive generic visuals. Each scene needs a visibly different shot type, subject framing or information design. Do not put unverified text, logos, real-time scores, prices or statistics into visuals.",
    "The visualPrompt should add concrete art direction, camera composition, focal subject, depth and motion. Avoid words or numbers baked into artwork; labels are rendered separately.",
    "Use strong editorial pacing: opening visual hook, one clear idea per scene, visual variety, readable mobile captions and a final takeaway.",
    "Do not invent factual details, dates, statistics, prices, quotations or company data. If a factual claim requires verification, mark it [VERIFY] in narration and explain it in editorialNote. Distinguish illustrative examples from real-world data.",
    "Keep scene durations positive and make their sum close to target duration. Script and narration must sound natural when read aloud.",
    "Return exactly one JSON object with title, script, editorialNote and scenes. Every scene must contain title, narration, caption, visualPrompt, visualPlan and duration. visualPlan must contain layout (hero, illustration, chart, candlestick, dashboard, process, comparison, timeline, diagram or infographic), subject, headline, labels, steps, values, trend and note. Use 4 to 8 complete scenes. Do not omit visualPlan fields; use empty arrays or empty strings when not needed.",
    "Return the requested JSON object only. Do not wrap it in Markdown fences or add commentary.",
  ].join("\n");
}

export async function generateStoryWithApiKey(options: GenerateOptions): Promise<{ story: GeneratedStory; source: "gemini" }> {
  const { topic, language, targetDuration, aspectRatio, apiKey } = options;
  const trimmedTopic = topic.trim();
  if (!trimmedTopic) throw new Error("Enter a topic before generating a story.");
  if (trimmedTopic.length > MAX_TOPIC_LENGTH) throw new Error("Keep the video topic under 2,000 characters.");
  if (!Number.isFinite(targetDuration) || targetDuration < 10 || targetDuration > 600) {
    throw new Error("Choose a video duration between 10 seconds and 10 minutes.");
  }
  if (!apiKey.trim()) throw new Error("Gemini API key is not configured on the server.");

  const prompt = buildStoryPrompt({
    topic: trimmedTopic,
    language,
    targetDuration,
    aspectRatio,
    genre: options.genre,
    trendContext: options.trendContext,
  });

  const response = await fetchWithTimeout(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim(),
      "Api-Revision": GEMINI_API_REVISION,
    },
    body: JSON.stringify({
      model: GEMINI_TEXT_MODEL,
      input: prompt,
      store: false,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: STORY_JSON_SCHEMA,
      },
    }),
  }, REQUEST_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(explainProviderError(response.status, await response.text()));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Gemini returned an unreadable response. Please retry the generation.");
  }

  const responseText = extractInteractionText(payload);
  if (!responseText) {
    const state = isRecord(payload) && typeof payload.status === "string" ? payload.status : "unknown";
    throw new Error("Gemini completed without returning story text (status: " + state + "). Try a shorter topic or generate again.");
  }
  return { story: parseStory(responseText), source: "gemini" };
}


async function readApiError(response: Response): Promise<Error> {
  let detail = "The secure AI service returned HTTP " + response.status + ".";
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload)) {
      if (typeof payload.error === "string") detail = payload.error;
      if (isRecord(payload.providerHealth)) saveAIProviderHealth(payload.providerHealth as AIProviderHealthMap);
    }
  } catch {
    // Keep the status-based error when the gateway did not return JSON.
  }
  return new Error(detail);
}

/** Abort a stalled same-origin generation stage and release the UI with a useful error. */
async function withRequestTimeout<T>(
  label: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(label + " timed out after " + Math.round(timeoutMs / 1000) + " seconds. The request was stopped; check the selected provider's free quota/status and retry.");
    }
    if (error instanceof TypeError) {
      throw new Error(label + " could not connect to the secure service. Check your connection and retry.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/** Public browser entry point: an optional per-tab key is passed only to the same-origin Pages Function. */
export async function generateStory(
  options: Omit<GenerateOptions, "apiKey">,
): Promise<{ story: GeneratedStory; source: AIProvider; fallbackNotice?: string }> {
  const payload: unknown = await withRequestTimeout("Story generation", 150_000, async (signal) => {
    const response = await fetch("/api/ai/story", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...getSelectedAIHeaders(), ...getAIProviderHealthHeader() },
      body: JSON.stringify(options),
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw await readApiError(response);
    try {
      return await response.json();
    } catch {
      throw new Error("The secure AI service returned an unreadable story response.");
    }
  });
  if (isRecord(payload) && isRecord(payload.providerHealth)) saveAIProviderHealth(payload.providerHealth as AIProviderHealthMap);
  if (!isRecord(payload) || !isRecord(payload.story) || typeof payload.story.title !== "string" || !Array.isArray(payload.story.scenes)) {
    throw new Error("The secure AI service returned an incomplete video storyboard.");
  }
  const source: AIProvider = payload.source === "groq" || payload.source === "openrouter" || payload.source === "cloudflare" ? payload.source : "gemini";
  const fallbackNotice = typeof payload.fallbackNotice === "string" ? payload.fallbackNotice : undefined;
  return { story: payload.story as unknown as GeneratedStory, source, fallbackNotice };
}

/** Generates one scene-specific still image with the explicitly selected Cloudflare Workers AI provider. */
export async function generateCloudflareSceneImage(prompt: string): Promise<string> {
  const payload: unknown = await withRequestTimeout("Scene artwork generation", 60_000, async (signal) => {
    const response = await fetch("/api/ai/scene-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...getSelectedAIHeaders() },
      body: JSON.stringify({ prompt }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw await readApiError(response);
    try {
      return await response.json();
    } catch {
      throw new Error("Cloudflare Workers AI returned an unreadable scene image response.");
    }
  });
  if (!isRecord(payload) || typeof payload.imageDataUrl !== "string" || !payload.imageDataUrl.startsWith("data:image/")) {
    throw new Error("Cloudflare Workers AI did not return a valid scene image.");
  }
  return payload.imageDataUrl;
}

/** Generates English voice-over with Cloudflare Workers AI Aura-1 on the same selected free-tier account. */
export async function generateCloudflareNarration(script: string, language: Language): Promise<Blob> {
  return withRequestTimeout("Voice-over generation", 120_000, async (signal) => {
    const response = await fetch("/api/ai/narration-cloudflare", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg", ...getSelectedAIHeaders() },
      body: JSON.stringify({ script, language }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw await readApiError(response);
    const audio = await response.blob();
    if (!audio.size || !audio.type.includes("audio")) {
      throw new Error("Cloudflare Aura did not return a usable narration audio file.");
    }
    return audio;
  });
}
/** Connection check uses the tab-session key when saved, otherwise the Cloudflare Pages secret. */
export async function testGeminiConnection(): Promise<string> {
  const response = await fetch("/api/ai/connection", {
    method: "POST",
    headers: { Accept: "application/json", ...getGeminiSessionHeaders() },
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The secure Gemini service returned an unreadable connection response.");
  }
  if (!isRecord(payload) || typeof payload.message !== "string") {
    throw new Error("The secure Gemini service returned an invalid connection response.");
  }
  return payload.message;
}
