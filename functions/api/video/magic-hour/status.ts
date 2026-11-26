import { checkSameOrigin, getMagicHourVideo, jsonNoStore, requireMagicHourKey } from "./_shared";

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const key = requireMagicHourKey(request);
  if (key instanceof Response) return key;
  const id = new URL(request.url).searchParams.get("id") || "";
  const job = await getMagicHourVideo(key, id);
  if (job instanceof Response) return job;
  const downloadReady = job.status === "complete" && Array.isArray(job.downloads) && Boolean(job.downloads[0]?.url);
  return jsonNoStore({
    id: job.id,
    status: job.status,
    creditsCharged: typeof job.credits_charged === "number" ? job.credits_charged : undefined,
    error: job.error ?? undefined,
    downloadReady,
  });
}
