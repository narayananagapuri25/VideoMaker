import { checkSameOrigin, jsonNoStore } from "../../ai/_shared";

export { checkSameOrigin, jsonNoStore };

export const AGNES_MODEL = "agnes-video-2.5-flash";
const AGNES_API_ROOT = "https://apihub.agnes-ai.com";

export interface AgnesVideoTask {
  video_id?: string;
  id?: string;
  task_id?: string;
  model?: string;
  status?: string;
  progress?: number;
  url?: string;
  error?: unknown;
}

export function requireAgnesKey(request: Request): string | Response {
  const key = request.headers.get("X-SochoZara-Agnes-Key")?.trim();
  if (!key) {
    return jsonNoStore({
      error: "Connect an Agnes AI API key in the Video AI Providers panel first.",
      code: "AGNES_NOT_CONFIGURED",
    }, 503);
  }
  if (key.length > 2_048) {
    return jsonNoStore({ error: "The Agnes AI API key is too long.", code: "AGNES_KEY_INVALID" }, 400);
  }
  return key;
}

export function requireAgnesFreeTrialConfirmation(request: Request): Response | null {
  if (request.headers.get("X-SochoZara-Agnes-Free-Trial") !== "true") {
    return jsonNoStore({
      error: "Agnes video generation is paused. Confirm that your Agnes account currently shows the Default / Angel User Trial price of $0 per second for Agnes Video 2.5 Flash, and that you are not using an Agent Plan.",
      code: "AGNES_FREE_TRIAL_CONFIRMATION_REQUIRED",
    }, 403);
  }
  return null;
}

export async function agnesRequest<T>(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; payload: T | null }> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", "Bearer " + key);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(AGNES_API_ROOT + path, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  let payload: T | null = null;
  try {
    payload = await response.json() as T;
  } catch {
    // Preserve HTTP status when upstream does not return JSON.
  }
  return { response, payload };
}

export function providerError(response: Response, payload: unknown): Response {
  const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const raw = typeof record.message === "string"
    ? record.message
    : typeof record.detail === "string"
      ? record.detail
      : typeof record.error === "string"
        ? record.error
        : "Agnes AI returned HTTP " + response.status + ".";
  const status = response.status === 429 ? 429
    : response.status === 401 ? 401
    : response.status === 402 ? 402
    : response.status >= 500 ? 502
    : response.status;
  return jsonNoStore({
    error: raw.replace(/\s+/g, " ").slice(0, 700),
    code: response.status === 429 ? "AGNES_RATE_LIMIT"
      : response.status === 401 ? "AGNES_AUTH"
      : response.status === 402 ? "AGNES_BILLING"
      : "AGNES_UPSTREAM",
    upstreamStatus: response.status,
  }, status);
}

export async function parseAgnesBody(request: Request, maxBytes = 4_000): Promise<Record<string, unknown> | Response> {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) return jsonNoStore({ error: "The Agnes video request is too large.", code: "REQUEST_TOO_LARGE" }, 413);
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return jsonNoStore({ error: "The request body is not valid JSON.", code: "INVALID_JSON" }, 400);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return jsonNoStore({ error: "The request must contain a JSON object.", code: "INVALID_REQUEST" }, 400);
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) {
    return jsonNoStore({ error: "The Agnes video request is too large.", code: "REQUEST_TOO_LARGE" }, 413);
  }
  return value as Record<string, unknown>;
}

export function isSafeAgnesDownloadUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(":")) return null;
    return url;
  } catch {
    return null;
  }
}
