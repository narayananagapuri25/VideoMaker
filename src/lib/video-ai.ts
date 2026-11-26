import { getMagicHourHeaders } from "./ai-provider-session";

export interface MagicHourConnection {
  connected: boolean;
  tier: string;
  credits: number;
  freeTier: boolean;
  freeModelAccess: string[];
  preferredModel: string;
  resolution: string;
  creditsPerSecond: number;
  affordableSecondsAt480p: number;
  estimatedFiveSecondClipCredits: number;
  commercialUse: string;
  message: string;
}

export interface MagicHourClipResult {
  blob: Blob;
  model: "default" | "minimax-h3";
  seconds: number;
  creditsCharged: number;
}

async function apiJson<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...getMagicHourHeaders(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  let payload: unknown;
  try {
    payload = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.text();
  } catch {
    throw new Error("The secure video service returned an unreadable response.");
  }
  if (!response.ok) {
    const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const message = typeof record.error === "string" ? record.error : "Video provider request failed (HTTP " + response.status + ").";
    const code = typeof record.code === "string" ? record.code : "";
    throw Object.assign(new Error(message), { code, status: response.status, details: payload });
  }
  return payload as T;
}

export async function checkMagicHourConnection(): Promise<MagicHourConnection> {
  return apiJson<MagicHourConnection>("/api/video/magic-hour/connection", "POST");
}

interface SubmitResponse {
  id: string;
  model: "default" | "minimax-h3";
  creditsCharged: number;
}

interface StatusResponse {
  id: string;
  status: "draft" | "queued" | "rendering" | "complete" | "error" | "canceled" | string;
  creditsCharged?: number;
  error?: unknown;
  downloadReady: boolean;
}

function jobError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.code === "string") return record.code;
  }
  return "The video generation job failed.";
}

export async function generateMagicHourClip(
  options: {
    prompt: string;
    seconds: number;
    aspectRatio: "9:16" | "16:9" | "1:1";
    onProgress?: (message: string) => void;
  },
): Promise<MagicHourClipResult> {
  const models: Array<"default" | "minimax-h3"> = ["default", "minimax-h3"];
  const failures: string[] = [];

  for (const model of models) {
    options.onProgress?.("Submitting " + (model === "default" ? "Magic Hour automatic Free-tier model (LTX-2.5)" : "MiniMax H3 fallback") + " at 480p…");
    let submitted: SubmitResponse;
    try {
      submitted = await apiJson<SubmitResponse>("/api/video/magic-hour/generate", "POST", {
        prompt: options.prompt,
        seconds: options.seconds,
        aspectRatio: options.aspectRatio,
        model,
      });
    } catch (error) {
      const details = error as Error & { code?: string; status?: number; details?: unknown };
      const upstreamStatus = typeof details.details === "object" && details.details !== null && "status" in details.details
        && typeof details.details.status === "number" ? details.details.status : details.status;
      if (details.code === "INSUFFICIENT_FREE_CREDITS" || upstreamStatus === 402) throw error;
      // Only a definite validation/model rejection is safe to retry. Network and
      // server errors may have accepted the job, so never risk duplicate charges.
      if (upstreamStatus !== 400 && upstreamStatus !== 404 && upstreamStatus !== 422) {
        throw new Error("The video submission result is uncertain. Check Magic Hour's dashboard before retrying to avoid a duplicate charge. " + (error instanceof Error ? error.message : "Unknown provider error."));
      }
      failures.push(model + ": " + (error instanceof Error ? error.message : "request rejected"));
      continue;
    }

    options.onProgress?.((model === "default" ? "Automatic Free-tier model" : "MiniMax H3") + " accepted the job. Waiting for the render…");
    let job: StatusResponse | null = null;
    let terminalError = "";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 3_000));
      try {
        job = await apiJson<StatusResponse>("/api/video/magic-hour/status", "POST", { id: submitted.id });
      } catch (error) {
        // Do not submit another job when the current job's state is unknown.
        throw new Error("Could not check the active Magic Hour job. The job may still be rendering; do not retry until its status is checked. " + (error instanceof Error ? error.message : ""));
      }
      if (job.status === "complete" && job.downloadReady) break;
      if (job.status === "error" || job.status === "canceled") {
        terminalError = jobError(job.error);
        break;
      }
      options.onProgress?.(model + " is " + job.status + "…");
    }

    if (job?.status === "complete" && job.downloadReady) {
      options.onProgress?.("Downloading the completed " + (model === "default" ? "automatic LTX-2.5" : "MiniMax H3") + " clip…");
      const response = await fetch("/api/video/magic-hour/download", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "video/mp4", ...getMagicHourHeaders() },
        body: JSON.stringify({ id: submitted.id }),
        cache: "no-store",
      });
      if (!response.ok) {
        let message = "The completed video could not be downloaded.";
        try {
          const payload: unknown = await response.json();
          if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") message = payload.error;
        } catch {
          // Keep the useful default error.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (blob.type && !blob.type.toLowerCase().includes("video")) {
        throw new Error("Magic Hour returned a file that was not recognised as video.");
      }
      if (!blob.size || blob.size > 24 * 1024 * 1024) {
        throw new Error("The generated clip is empty or exceeds the 24 MB per-scene local media limit.");
      }
      return {
        blob: new Blob([blob], { type: "video/mp4" }),
        model,
        seconds: options.seconds,
        creditsCharged: job.creditsCharged ?? submitted.creditsCharged,
      };
    }

    if (!terminalError) {
      throw new Error("The Magic Hour render has not finished after three minutes. The job may still be running; check the Magic Hour dashboard before retrying.");
    }
    failures.push(model + ": " + terminalError);
    // Failed jobs are refunded by Magic Hour; only then is the other free model tried.
    options.onProgress?.(model + " failed and will be refunded. Trying the next free model…");
  }

  throw new Error("No free Magic Hour model completed this clip. " + failures.join(" | "));
}
