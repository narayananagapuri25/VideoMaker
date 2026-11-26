export interface GeminiEnv {
  GEMINI_API_KEY?: string;
}

export interface PagesContext {
  request: Request;
  env: GeminiEnv;
}

export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    },
  });
}

export function checkSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return jsonNoStore({ error: "This AI endpoint only accepts requests from the SochoZara Studio website." }, 403);
    }
  } catch {
    return jsonNoStore({ error: "The request origin could not be verified." }, 403);
  }
  return null;
}

export function requireGeminiKey(env: GeminiEnv): string | Response {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    return jsonNoStore({
      error: "Gemini is not connected on the server yet. Add GEMINI_API_KEY as an encrypted secret in Cloudflare Pages → Settings → Variables and Secrets, then redeploy the production branch.",
      code: "GEMINI_NOT_CONFIGURED",
    }, 503);
  }
  return key;
}

export async function parseJsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown> | Response> {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maxBytes) {
    return jsonNoStore({ error: "The request is too large. Shorten the topic or narration and try again." }, 413);
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return jsonNoStore({ error: "The request body is not valid JSON." }, 400);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return jsonNoStore({ error: "The request must contain a JSON object." }, 400);
  }
  const body = value as Record<string, unknown>;
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > maxBytes) {
    return jsonNoStore({ error: "The request is too large. Shorten the topic or narration and try again." }, 413);
  }
  return body;
}

export function providerError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Gemini could not complete this request.";
  const quota = /quota|rate limit|\(429\)/i.test(message);
  const auth = /\(401\)|\(403\)|api key|permission denied/i.test(message);
  const status = quota ? 429 : auth ? 502 : /timed out|timeout/i.test(message) ? 504 : 502;
  return jsonNoStore({ error: message.slice(0, 900), code: quota ? "GEMINI_QUOTA" : auth ? "GEMINI_AUTH" : "GEMINI_UPSTREAM" }, status);
}
