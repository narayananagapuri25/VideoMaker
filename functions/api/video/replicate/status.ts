import {
  checkSameOrigin,
  jsonNoStore,
  parseReplicateBody,
  providerError,
  replicateRequest,
  requireReplicateKey,
  requireReplicateTryFreeConfirmation,
  type ReplicatePrediction,
} from "./_shared";

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireReplicateKey(request);
  if (key instanceof Response) return key;
  const consentError = requireReplicateTryFreeConfirmation(request);
  if (consentError) return consentError;
  const body = await parseReplicateBody(request, 1_000);
  if (body instanceof Response) return body;
  const predictionId = typeof body.predictionId === "string" ? body.predictionId : "";
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(predictionId)) {
    return jsonNoStore({ error: "The Replicate prediction ID is invalid.", code: "REPLICATE_PREDICTION_ID_INVALID" }, 400);
  }
  try {
    const { response, payload } = await replicateRequest<ReplicatePrediction>(
      key,
      "/v1/predictions/" + encodeURIComponent(predictionId),
    );
    if (!response.ok) return providerError(response, payload);
    const status = typeof payload?.status === "string" ? payload.status : "unknown";
    if (!["starting", "processing", "succeeded", "failed", "canceled"].includes(status)) {
      return jsonNoStore({ error: "Replicate returned an unrecognised prediction state: " + status, code: "REPLICATE_STATUS_INVALID" }, 502);
    }
    const rawOutput = payload?.output;
    const outputUrl = typeof rawOutput === "string"
      ? rawOutput
      : Array.isArray(rawOutput) && typeof rawOutput[0] === "string"
        ? rawOutput[0]
        : undefined;
    return jsonNoStore({
      predictionId,
      status,
      outputReady: status === "succeeded" && Boolean(outputUrl),
      error: status === "failed" || status === "canceled" ? payload?.error ?? "Replicate prediction did not complete." : undefined,
    });
  } catch {
    return jsonNoStore({ error: "Could not retrieve the Replicate prediction status.", code: "REPLICATE_STATUS_NETWORK_ERROR" }, 502);
  }
}
