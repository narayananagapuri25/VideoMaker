import {
  AGNES_MODEL,
  agnesRequest,
  checkSameOrigin,
  jsonNoStore,
  providerError,
  requireAgnesKey,
} from "./_shared";

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireAgnesKey(request);
  if (key instanceof Response) return key;

  try {
    const { response, payload } = await agnesRequest<Record<string, unknown>>(key, "/v1/models");
    if (!response.ok) return providerError(response, payload);
    const data = payload && Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
    const available = data.some((item) => item.id === AGNES_MODEL);
    if (!available) {
      return jsonNoStore({
        connected: true,
        modelAvailable: false,
        model: AGNES_MODEL,
        message: "The API key is valid, but Agnes Video 2.5 Flash was not listed for this account. No video request was made.",
      }, 409);
    }
    return jsonNoStore({
      connected: true,
      modelAvailable: true,
      model: AGNES_MODEL,
      resolution: "720P",
      minimumSeconds: 4,
      maximumSeconds: 12,
      trialPrice: "$0 per second · limited-time Angel User Trial offer",
      message: "Agnes API key is valid and Agnes Video 2.5 Flash is listed. This check does not verify your account's billing plan or current trial price; confirm the $0 offer in Agnes Billing and keep the Default / Angel User Trial account type before opting in.",
    });
  } catch {
    return jsonNoStore({ error: "Could not reach Agnes AI. Check your connection and retry.", code: "AGNES_NETWORK_ERROR" }, 502);
  }
}
