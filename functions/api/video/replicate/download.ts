import {
  checkSameOrigin,
  isSafeReplicateDownloadUrl,
  jsonNoStore,
  parseReplicateBody,
  providerError,
  replicateRequest,
  requireReplicateKey,
  requireReplicateTryFreeConfirmation,
  type ReplicatePrediction,
} from "./_shared";

const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

async function fetchReplicateVideo(initialUrl: URL): Promise<Response | null> {
  let current = initialUrl;
  for (let hop = 0; hop <= 3; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === 3) return null;
      const next = isSafeReplicateDownloadUrl(new URL(location, current).toString());
      if (!next) return null;
      current = next;
      continue;
    }
    return response;
  }
  return null;
}

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

  const { response, payload } = await replicateRequest<ReplicatePrediction>(
    key,
    "/v1/predictions/" + encodeURIComponent(predictionId),
  );
  if (!response.ok) return providerError(response, payload);
  if (payload?.status !== "succeeded") {
    return jsonNoStore({ error: "The Replicate video prediction is not ready to download.", code: "VIDEO_NOT_READY" }, 409);
  }
  const rawOutput = payload.output;
  const outputUrl = typeof rawOutput === "string"
    ? rawOutput
    : Array.isArray(rawOutput) && typeof rawOutput[0] === "string"
      ? rawOutput[0]
      : "";
  const url = outputUrl ? isSafeReplicateDownloadUrl(outputUrl) : null;
  if (!url) {
    return jsonNoStore({ error: "Replicate returned an unsafe or unsupported video URL. The file was not fetched.", code: "REPLICATE_DOWNLOAD_URL_REJECTED" }, 502);
  }

  const videoResponse = await fetchReplicateVideo(url);
  if (!videoResponse?.ok || !videoResponse.body) {
    return jsonNoStore({ error: "The Replicate video file could not be reached.", code: "REPLICATE_DOWNLOAD_FAILED" }, 502);
  }
  const declaredLength = Number(videoResponse.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_VIDEO_BYTES) {
    await videoResponse.body.cancel().catch(() => undefined);
    return jsonNoStore({ error: "The Replicate clip exceeds the 30 MB local project safety limit.", code: "VIDEO_TOO_LARGE" }, 413);
  }

  const reader = videoResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!item.value) continue;
      totalBytes += item.value.byteLength;
      if (totalBytes > MAX_VIDEO_BYTES) {
        await reader.cancel().catch(() => undefined);
        return jsonNoStore({ error: "The Replicate clip exceeds the 30 MB local project safety limit.", code: "VIDEO_TOO_LARGE" }, 413);
      }
      chunks.push(item.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return jsonNoStore({ error: "The Replicate video download was interrupted.", code: "REPLICATE_DOWNLOAD_INTERRUPTED" }, 502);
  }
  if (totalBytes === 0) return jsonNoStore({ error: "Replicate returned an empty video file.", code: "REPLICATE_DOWNLOAD_EMPTY" }, 502);
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(totalBytes),
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": 'attachment; filename="sochozara-replicate-video.mp4"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
