import { checkSameOrigin, jsonNoStore } from "../../ai/_shared";

export { checkSameOrigin, jsonNoStore };

export const REPLICATE_MODEL_OWNER = "minimax";
export const REPLICATE_MODEL_NAME = "video-01";

export interface ReplicatePrediction {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  urls?: { get?: string; cancel?: string; web?: string };
}

export function requireReplicateKey(request: Request): string | Response {
  const key = request.headers.get("X-SochoZara-Replicate-Key")?.trim();
  if (!key) {
    return jsonNoStore({
      error: "Connect a Replicate API token in Video AI Providers before using the limited free model.",
      code: "REPLICATE_NOT_CONFIGURED",
    }, 503);
  }
  if (key.length > 2_048) {
    return jsonNoStore({ error: "The Replicate API token is too long.", code: "REPLICATE_KEY_INVALID" }, 400);
  }
  return key;
}

export function requireReplicateTryFreeConfirmation(request: Request): Response | null {
  if (request.headers.get("X-SochoZara-Replicate-Try-Free") !== "true") {
    return jsonNoStore({
      error: "Replicate video generation is paused. Confirm that this account still has free Try-for-Free runs available, has no paid billing or purchased credits, and that you will not add billing for this automatic route.",
      code: "REPLICATE_TRY_FREE_CONFIRMATION_REQUIRED",
    }, 403);
  }
  return null;
}

export async function replicateRequest<T>(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; payload: T | null }> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", "Bearer " + key);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch("https://api.replicate.com" + path, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  let payload: T | null = null;
  try {
    payload = await response.json() as T;
  } catch {
    // HTTP status remains available for non-JSON provider errors.
  }
  return { response, payload };
}

export function providerError(response: Response, payload: unknown): Response {
  const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const raw = typeof record.detail === "string"
    ? record.detail
    : typeof record.title === "string"
      ? record.title
      : typeof record.error === "string"
        ? record.error
        : "Replicate returned HTTP " + response.status + ".";
  const status = response.status === 401 ? 401
    : response.status === 402 ? 402
    : response.status === 429 ? 429
    : response.status >= 500 ? 502
    : response.status;
  return jsonNoStore({
    error: raw.replace(/\s+/g, " ").slice(0, 700),
    code: response.status === 402 ? "REPLICATE_BILLING_REQUIRED"
      : response.status === 429 ? "REPLICATE_RATE_LIMIT"
      : response.status === 401 ? "REPLICATE_AUTH"
      : "REPLICATE_UPSTREAM",
    upstreamStatus: response.status,
  }, status);
}

export async function parseReplicateBody(request: Request, maxBytes = 4_000): Promise<Record<string, unknown> | Response> {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) return jsonNoStore({ error: "The Replicate request is too large.", code: "REQUEST_TOO_LARGE" }, 413);
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
    return jsonNoStore({ error: "The Replicate request is too large.", code: "REQUEST_TOO_LARGE" }, 413);
  }
  return value as Record<string, unknown>;
}

export function isSafeReplicateDownloadUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (!(host === "replicate.delivery" || host.endsWith(".replicate.delivery"))) return null;
    return url;
  } catch {
    return null;
  }
}
