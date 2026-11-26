import { checkSameOrigin, jsonNoStore } from "../../ai/_shared";

export { checkSameOrigin, jsonNoStore };

export interface MagicHourAccount {
  tier: string;
  credits: number;
  subscription: Record<string, unknown> | null;
}

export interface MagicHourVideo {
  id: string;
  status: "draft" | "queued" | "rendering" | "complete" | "error" | "canceled" | string;
  credits_charged?: number;
  error?: unknown;
  downloads?: Array<{ url?: string; expires_at?: string }>;
}

export function requireMagicHourKey(request: Request): string | Response {
  const key = request.headers.get("X-SochoZara-Magic-Hour-Key")?.trim();
  if (!key) {
    return jsonNoStore({ error: "Connect Magic Hour in the Video AI Providers panel before generating an AI video clip.", code: "MAGIC_HOUR_NOT_CONFIGURED" }, 503);
  }
  if (key.length > 2_048) {
    return jsonNoStore({ error: "The Magic Hour API key is too long. Replace it with a valid developer key.", code: "MAGIC_HOUR_KEY_INVALID" }, 400);
  }
  return key;
}

export async function providerRequest<T>(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; payload: T | null }> {
  const response = await fetch("https://api.magichour.ai" + path, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + key,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  let payload: T | null = null;
  try {
    payload = await response.json() as T;
  } catch {
    // Status remains available for an actionable error below.
  }
  return { response, payload };
}

export async function readProviderError(response: Response, payload: unknown): Promise<Response> {
  const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const message = typeof record.message === "string"
    ? record.message
    : typeof record.error === "string"
      ? record.error
      : "Magic Hour returned HTTP " + response.status + ".";
  const code = typeof record.code === "string" ? record.code : "MAGIC_HOUR_UPSTREAM";
  const status = response.status === 402 ? 402 : response.status === 401 ? 401 : response.status >= 500 ? 502 : response.status;
  return jsonNoStore({ error: message.slice(0, 600), code, status: response.status }, status);
}

export async function getMagicHourAccount(key: string): Promise<MagicHourAccount | Response> {
  const { response, payload } = await providerRequest<Record<string, unknown>>(key, "/v1/account");
  if (!response.ok) return readProviderError(response, payload);
  if (!payload || typeof payload.tier !== "string" || typeof payload.credits !== "number" || !Number.isFinite(payload.credits)) {
    return jsonNoStore({ error: "Magic Hour responded, but the account and credit balance could not be verified.", code: "MAGIC_HOUR_ACCOUNT_INVALID" }, 502);
  }
  return {
    tier: payload.tier,
    credits: Math.max(0, Math.floor(payload.credits)),
    subscription: typeof payload.subscription === "object" && payload.subscription !== null
      ? payload.subscription as Record<string, unknown>
      : null,
  };
}

export async function getMagicHourVideo(key: string, id: string): Promise<MagicHourVideo | Response> {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
    return jsonNoStore({ error: "The Magic Hour video job ID is invalid.", code: "MAGIC_HOUR_JOB_ID_INVALID" }, 400);
  }
  const { response, payload } = await providerRequest<MagicHourVideo>(key, "/v1/video-projects/" + encodeURIComponent(id));
  if (!response.ok) return readProviderError(response, payload);
  if (!payload || typeof payload.id !== "string" || typeof payload.status !== "string") {
    return jsonNoStore({ error: "Magic Hour returned an invalid job status response.", code: "MAGIC_HOUR_STATUS_INVALID" }, 502);
  }
  return payload;
}

export async function parseRequestBody(request: Request, maxBytes = 12_000): Promise<Record<string, unknown> | Response> {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) return jsonNoStore({ error: "The video request is too large.", code: "REQUEST_TOO_LARGE" }, 413);
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
    return jsonNoStore({ error: "The video request is too large.", code: "REQUEST_TOO_LARGE" }, 413);
  }
  return value as Record<string, unknown>;
}
