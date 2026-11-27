import {
  checkSameOrigin,
  jsonNoStore,
  parseReplicateBody,
  providerError,
  replicateRequest,
  REPLICATE_MODEL_NAME,
  REPLICATE_MODEL_OWNER,
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
  const body = await parseReplicateBody(request);
  if (body instanceof Response) return body;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 2_000) {
    return jsonNoStore({ error: "Enter a Replicate video prompt between 1 and 2,000 characters.", code: "INVALID_PROMPT" }, 400);
  }

  try {
    const { response, payload } = await replicateRequest<ReplicatePrediction>(
      key,
      "/v1/models/" + REPLICATE_MODEL_OWNER + "/" + REPLICATE_MODEL_NAME + "/predictions",
      {
        method: "POST",
        headers: { Prefer: "wait=1", "Cancel-After": "10m" },
        body: JSON.stringify({
          input: { prompt },
        }),
      },
    );
    if (!response.ok) return providerError(response, payload);
    const predictionId = typeof payload?.id === "string" ? payload.id : "";
    if (!predictionId) {
      return jsonNoStore({
        error: "Replicate accepted the request but returned no prediction ID. Check the Replicate dashboard before retrying.",
        code: "REPLICATE_PREDICTION_ID_MISSING",
      }, 502);
    }
    return jsonNoStore({
      predictionId,
      model: REPLICATE_MODEL_OWNER + "/" + REPLICATE_MODEL_NAME,
      status: typeof payload?.status === "string" ? payload.status : "starting",
      message: "Replicate accepted a Try-for-Free prediction. This API cannot report how many free runs remain; if Replicate requests billing or credits, stop and do not add them.",
    }, 202);
  } catch {
    return jsonNoStore({
      error: "The Replicate submission result is uncertain. Check the Replicate dashboard before retrying to avoid creating a duplicate prediction.",
      code: "REPLICATE_SUBMISSION_UNCERTAIN",
    }, 502);
  }
}
