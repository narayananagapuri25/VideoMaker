import {
  AGNES_MODEL,
  agnesRequest,
  checkSameOrigin,
  jsonNoStore,
  parseAgnesBody,
  providerError,
  requireAgnesFreeTrialConfirmation,
  requireAgnesKey,
  type AgnesVideoTask,
} from "./_shared";

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireAgnesKey(request);
  if (key instanceof Response) return key;
  const consentError = requireAgnesFreeTrialConfirmation(request);
  if (consentError) return consentError;
  const body = await parseAgnesBody(request);
  if (body instanceof Response) return body;

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const seconds = Number(body.seconds);
  const aspectRatio = body.aspectRatio;
  if (!prompt || prompt.length > 2_000) {
    return jsonNoStore({ error: "Enter an Agnes video prompt between 1 and 2,000 characters.", code: "INVALID_PROMPT" }, 400);
  }
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 12) {
    return jsonNoStore({ error: "Agnes Video 2.5 Flash supports clips from 4 to 12 seconds.", code: "INVALID_DURATION" }, 400);
  }
  if (aspectRatio !== "9:16" && aspectRatio !== "16:9" && aspectRatio !== "1:1") {
    return jsonNoStore({ error: "Choose a supported video aspect ratio.", code: "INVALID_ASPECT_RATIO" }, 400);
  }

  try {
    const { response, payload } = await agnesRequest<AgnesVideoTask>(key, "/v1/videos", {
      method: "POST",
      body: JSON.stringify({
        model: AGNES_MODEL,
        prompt,
        seconds: String(seconds),
        mode: "text",
        size: "720P",
        aspect_ratio: aspectRatio,
        n: 1,
      }),
    });
    if (!response.ok) return providerError(response, payload);
    const videoId = typeof payload?.video_id === "string" ? payload.video_id : "";
    if (!videoId) {
      return jsonNoStore({
        error: "Agnes accepted the request but returned no video ID. Check the Agnes dashboard before retrying.",
        code: "AGNES_VIDEO_ID_MISSING",
      }, 502);
    }
    return jsonNoStore({
      videoId,
      model: AGNES_MODEL,
      resolution: "720P",
      requestedSeconds: seconds,
      status: typeof payload?.status === "string" ? payload.status : "queued",
      message: "Agnes accepted the video task. The free-trial price is not confirmed by the API response; your account billing terms still apply.",
    }, 202);
  } catch {
    return jsonNoStore({
      error: "The Agnes submission result is uncertain. Check the Agnes dashboard before retrying to avoid creating a duplicate task.",
      code: "AGNES_SUBMISSION_UNCERTAIN",
    }, 502);
  }
}
