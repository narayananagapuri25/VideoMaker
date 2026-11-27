import {
  checkSameOrigin,
  getMagicHourVideo,
  jsonNoStore,
  parseRequestBody,
  requireMagicHourKey,
} from "./_shared";

const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

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
  if (url.protocol !== "https:" || url.hostname !== "videos.magichour.ai" || url.username || url.password) {
    return jsonNoStore({ error: "The video download host was not recognised. Nothing was downloaded.", code: "DOWNLOAD_HOST_REJECTED" }, 502);
  }

  let videoResponse: Response;
  try {
    videoResponse = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  } catch {
    return jsonNoStore({ error: "The generated clip could not be reached before the download timed out.", code: "VIDEO_DOWNLOAD_TIMEOUT" }, 504);
  }
  if (!videoResponse.ok || !videoResponse.body) {
    return jsonNoStore({ error: "The generated video could not be downloaded from Magic Hour.", code: "VIDEO_DOWNLOAD_FAILED" }, 502);
  }

  const declaredLength = Number(videoResponse.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_VIDEO_BYTES) {
    await videoResponse.body.cancel().catch(() => undefined);
    return jsonNoStore({ error: "The generated clip exceeds the 30 MB local project safety limit.", code: "VIDEO_TOO_LARGE" }, 413);
  }

  const reader = videoResponse.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value) continue;
      totalBytes += part.value.byteLength;
      if (totalBytes > MAX_VIDEO_BYTES) {
        await reader.cancel().catch(() => undefined);
        return jsonNoStore({ error: "The generated clip exceeds the 30 MB local project safety limit.", code: "VIDEO_TOO_LARGE" }, 413);
      }
      chunks.push(part.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return jsonNoStore({ error: "The generated video download was interrupted.", code: "VIDEO_DOWNLOAD_INTERRUPTED" }, 502);
  }

  if (!totalBytes) {
    return jsonNoStore({ error: "Magic Hour returned an empty video file.", code: "VIDEO_DOWNLOAD_EMPTY" }, 502);
  }

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
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": 'attachment; filename="sochozara-ai-clip.mp4"',
      "Content-Length": String(totalBytes),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
