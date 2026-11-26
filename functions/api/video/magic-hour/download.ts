import {
  checkSameOrigin,
  getMagicHourVideo,
  jsonNoStore,
  parseRequestBody,
  requireMagicHourKey,
} from "./_shared";

const ALLOWED_VIDEO_HOSTS = new Set(["videos.magichour.ai", "cdn.magichour.ai"]);

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireMagicHourKey(request);
  if (key instanceof Response) return key;
  const body = await parseRequestBody(request, 1_000);
  if (body instanceof Response) return body;
  const id = typeof body.id === "string" ? body.id : "";
  const job = await getMagicHourVideo(key, id);
  if (job instanceof Response) return job;
  if (job.status !== "complete" || !Array.isArray(job.downloads) || !job.downloads[0]?.url) {
    return jsonNoStore({ error: "This video is not ready to download yet.", code: "VIDEO_NOT_READY" }, 409);
  }

  let url: URL;
  try {
    url = new URL(job.downloads[0].url);
  } catch {
    return jsonNoStore({ error: "Magic Hour returned an invalid download URL.", code: "INVALID_DOWNLOAD_URL" }, 502);
  }
  if (url.protocol !== "https:" || !ALLOWED_VIDEO_HOSTS.has(url.hostname)) {
    return jsonNoStore({ error: "The video download host was not recognised. Nothing was downloaded.", code: "DOWNLOAD_HOST_REJECTED" }, 502);
  }

  const videoResponse = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  if (!videoResponse.ok || !videoResponse.body) {
    return jsonNoStore({ error: "The generated video could not be downloaded from Magic Hour.", code: "VIDEO_DOWNLOAD_FAILED" }, 502);
  }
  const contentLength = Number(videoResponse.headers.get("Content-Length") || 0);
  if (contentLength > 30 * 1024 * 1024) {
    return jsonNoStore({ error: "The generated clip exceeds the 30 MB local project safety limit.", code: "VIDEO_TOO_LARGE" }, 413);
  }
  return new Response(videoResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": 'attachment; filename="sochozara-ai-clip.mp4"',
      ...(contentLength > 0 ? { "Content-Length": String(contentLength) } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
