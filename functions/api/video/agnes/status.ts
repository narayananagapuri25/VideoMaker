import {
  AGNES_MODEL,
  agnesRequest,
  checkSameOrigin,
  jsonNoStore,
  providerError,
  requireAgnesFreeTrialConfirmation,
  requireAgnesKey,
} from "./_shared";

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireAgnesKey(request);
  if (key instanceof Response) return key;
  const consentError = requireAgnesFreeTrialConfirmation(request);
  if (consentError) return consentError;
  const videoId = new URL(request.url).searchParams.get("video_id") || "";
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(videoId)) {
    return jsonNoStore({ error: "The Agnes video ID is invalid.", code: "AGNES_VIDEO_ID_INVALID" }, 400);
  }
  try {
    const query = "/agnesapi?video_id=" + encodeURIComponent(videoId) + "&model_name=" + encodeURIComponent(AGNES_MODEL);
    const { response, payload } = await agnesRequest<Record<string, unknown>>(key, query);
    if (!response.ok) return providerError(response, payload);
    const status = typeof payload?.status === "string" ? payload.status : "unknown";
    if (!["queued", "in_progress", "completed", "failed"].includes(status)) {
      return jsonNoStore({ error: "Agnes returned an unrecognised task state: " + status, code: "AGNES_STATUS_INVALID" }, 502);
    }
    return jsonNoStore({
      videoId,
      status,
      progress: typeof payload?.progress === "number" ? Math.max(0, Math.min(100, payload.progress)) : undefined,
      url: status === "completed" && typeof payload?.url === "string" ? payload.url : undefined,
      error: status === "failed" ? payload?.error ?? "Agnes video generation failed." : undefined,
    });
  } catch {
    return jsonNoStore({ error: "Could not retrieve the Agnes video status.", code: "AGNES_STATUS_NETWORK_ERROR" }, 502);
  }
}
