import {
  checkSameOrigin,
  getMagicHourAccount,
  jsonNoStore,
  parseRequestBody,
  providerRequest,
  readProviderError,
  requireMagicHourKey,
} from "./_shared";

const MODELS = ["ltx-2.5", "minimax-h3"] as const;
const CREDITS_PER_SECOND_AT_480P = 24;

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireMagicHourKey(request);
  if (key instanceof Response) return key;
  const body = await parseRequestBody(request);
  if (body instanceof Response) return body;

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const seconds = Number(body.seconds);
  const aspectRatio = body.aspectRatio;
  const model = typeof body.model === "string" ? body.model : "ltx-2.5";

  if (!prompt || prompt.length > 2_000) {
    return jsonNoStore({ error: "Enter a video prompt between 1 and 2,000 characters.", code: "INVALID_PROMPT" }, 400);
  }
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 10) {
    return jsonNoStore({ error: "Free-tier mode creates short clips from 1 to 10 seconds. Choose a shorter clip.", code: "INVALID_DURATION" }, 400);
  }
  if (aspectRatio !== "9:16" && aspectRatio !== "16:9" && aspectRatio !== "1:1") {
    return jsonNoStore({ error: "Choose a supported video aspect ratio.", code: "INVALID_ASPECT_RATIO" }, 400);
  }
  if (!MODELS.includes(model as typeof MODELS[number])) {
    return jsonNoStore({ error: "The selected model is not enabled for free-tier generation.", code: "MODEL_NOT_ALLOWED" }, 400);
  }

  const account = await getMagicHourAccount(key);
  if (account instanceof Response) return account;
  if (account.tier !== "free" || account.subscription !== null) {
    return jsonNoStore({
      error: "The connected Magic Hour account is not verified as Free. No video job was submitted. Use a Free-tier account to enable free-only generation.",
      code: "FREE_TIER_ACCOUNT_REQUIRED",
      tier: account.tier,
    }, 403);
  }
  const estimatedCredits = seconds * CREDITS_PER_SECOND_AT_480P;
  if (account.credits < estimatedCredits) {
    return jsonNoStore({
      error: "Not enough Magic Hour credits for this clip. No generation was submitted and no credits were charged.",
      code: "INSUFFICIENT_FREE_CREDITS",
      credits: account.credits,
      requiredCredits: estimatedCredits,
      affordableSecondsAt480p: Math.floor(account.credits / CREDITS_PER_SECOND_AT_480P),
    }, 402);
  }

  const idempotencyKey = globalThis.crypto.randomUUID();
  const { response, payload } = await providerRequest<Record<string, unknown>>(key, "/v1/text-to-video", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      end_seconds: seconds,
      aspect_ratio: aspectRatio,
      model,
      resolution: "480p",
      audio: true,
      name: "SochoZara · " + prompt.slice(0, 70),
      style: { prompt },
    }),
  });
  if (!response.ok) return readProviderError(response, payload);
  if (!payload || typeof payload.id !== "string") {
    return jsonNoStore({ error: "Magic Hour accepted the request but did not return a video job ID.", code: "MAGIC_HOUR_JOB_ID_MISSING" }, 502);
  }

  return jsonNoStore({
    id: payload.id,
    model,
    resolution: "480p",
    requestedSeconds: seconds,
    creditsCharged: typeof payload.credits_charged === "number" ? payload.credits_charged : estimatedCredits,
    idempotencyKey,
    message: "Video generation queued on Magic Hour.",
  }, 202);
}
