import {
  checkSameOrigin,
  jsonNoStore,
  providerError,
  REPLICATE_MODEL_NAME,
  REPLICATE_MODEL_OWNER,
  replicateRequest,
  requireReplicateKey,
} from "./_shared";

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireReplicateKey(request);
  if (key instanceof Response) return key;
  try {
    const { response, payload } = await replicateRequest<Record<string, unknown>>(
      key,
      "/v1/models/" + REPLICATE_MODEL_OWNER + "/" + REPLICATE_MODEL_NAME,
    );
    if (!response.ok) return providerError(response, payload);
    return jsonNoStore({
      connected: true,
      modelAvailable: true,
      model: REPLICATE_MODEL_OWNER + "/" + REPLICATE_MODEL_NAME,
      tryForFree: true,
      freeRunLimit: "limited and not published",
      message: "Replicate token and minimax/video-01 model access verified. The Try-for-Free collection offers limited free runs, but the API does not expose the remaining free-run counter. This check does not verify paid billing or purchased credits.",
    });
  } catch {
    return jsonNoStore({ error: "Could not reach Replicate. Check your connection and try again.", code: "REPLICATE_NETWORK_ERROR" }, 502);
  }
}
