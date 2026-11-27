export interface WorkersAIBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface GeminiEnv {
  GEMINI_API_KEY?: string;
  AI?: WorkersAIBinding;
}

export interface AIRequestCredentials {
  cloudflareAI?: WorkersAIBinding;
  gemini?: string;
  groq?: string;
  openrouter?: string;
  cloudflareApiToken?: string;
  cloudflareAccountId?: string;
}

export interface PagesContext {
  request: Request;
  env: GeminiEnv;
}

const SESSION_KEY_HEADER = "X-SochoZara-Gemini-Key";
const MAX_SESSION_KEY_LENGTH = 512;

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
  if (!origin) return jsonNoStore({ error: "The browser origin was not provided. Reload the Studio and try again." }, 403);
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return jsonNoStore({ error: "This AI endpoint only accepts requests from the SochoZara Studio website." }, 403);
    }
  } catch {
    return jsonNoStore({ error: "The request origin could not be verified." }, 403);
  }
  return null;
}

/** A per-tab browser key takes precedence; otherwise use the encrypted Pages secret. */
export function resolveGeminiKey(request: Request, env: GeminiEnv): string | undefined {
  const sessionKey = request.headers.get(SESSION_KEY_HEADER)?.trim();
  if (sessionKey && sessionKey.length <= MAX_SESSION_KEY_LENGTH) return sessionKey;
  const serverKey = env.GEMINI_API_KEY?.trim();
  return serverKey || undefined;
}

export function resolveAIRequestCredentials(request: Request, env: GeminiEnv): AIRequestCredentials {
  const header = (name: string, max: number): string | undefined => {
    const value = request.headers.get(name)?.trim();
    return value && value.length <= max ? value : undefined;
  };
  return {
    gemini: resolveGeminiKey(request, env),
    groq: header("X-SochoZara-Groq-Key", 2_048),
    openrouter: header("X-SochoZara-OpenRouter-Key", 2_048),
    cloudflareApiToken: header("X-SochoZara-Cloudflare-Token", 2_048),
    cloudflareAccountId: header("X-SochoZara-Cloudflare-Account", 128),
  };
}

export function requireGeminiKey(request: Request, env: GeminiEnv): string | Response {
  const sessionKey = request.headers.get(SESSION_KEY_HEADER)?.trim();
  if (sessionKey && sessionKey.length > MAX_SESSION_KEY_LENGTH) {
    return jsonNoStore({ error: "The Gemini key entered for this tab is too long. Replace it with the key from Google AI Studio." }, 400);
  }
  const key = resolveGeminiKey(request, env);
  if (!key) {
    return jsonNoStore({
      error: "Gemini is not connected. Enter your Google AI Studio API key in the Studio and save it for this tab, or configure GEMINI_API_KEY as an encrypted Cloudflare Pages secret.",
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
  const quota = /quota|rate limit|daily limit|free allocation|neurons?|\(429\)/i.test(message);
  const auth = /\(401\)|\(403\)|api key|permission denied/i.test(message);
  const status = quota ? 429 : auth ? 502 : /timed out|timeout/i.test(message) ? 504 : 502;
  return jsonNoStore({ error: message.slice(0, 900), code: quota ? "GEMINI_QUOTA" : auth ? "GEMINI_AUTH" : "GEMINI_UPSTREAM" }, status);
}
