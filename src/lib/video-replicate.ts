import { getReplicateConnectionHeaders, getReplicateHeaders } from "./ai-provider-session";

export interface ReplicateConnection {
  connected: boolean;
  modelAvailable: boolean;
  model: string;
  tryForFree: boolean;
  freeRunLimit: string;
  message: string;
}

export interface ReplicateClipResult {
  blob: Blob;
  model: "minimax/video-01";
  seconds: 6;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The Replicate video service returned an unreadable response.");
  }
  if (!response.ok) {
    const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const message = typeof record.error === "string"
      ? record.error
      : "Replicate video request failed (HTTP " + response.status + ").";
    throw Object.assign(new Error(message), {
      code: typeof record.code === "string" ? record.code : "",
      status: response.status,
      upstreamStatus: typeof record.upstreamStatus === "number" ? record.upstreamStatus : response.status,
    });
  }
  return payload as T;
}

async function fetchJson<T>(path: string, body: unknown, headers: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("Replicate could not be reached from SochoZara Studio.");
  }
  return readJsonResponse<T>(response);
}

export async function checkReplicateConnection(): Promise<ReplicateConnection> {
  return fetchJson<ReplicateConnection>("/api/video/replicate/connection", {}, getReplicateConnectionHeaders());
}

interface CreatePredictionResponse {
  predictionId: string;
  model: "minimax/video-01";
  status: string;
}

interface PredictionStatusResponse {
  predictionId: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  outputReady: boolean;
  error?: unknown;
}

function normalisePredictionError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.message === "string") return record.message;
  }
  return "Replicate video prediction failed.";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

/** Replicate Try-for-Free collection only. One clip per project; free runs are limited and no credit purchase is automated. */
export async function generateReplicateClip(options: {
  prompt: string;
  onProgress?: (message: string) => void;
}): Promise<ReplicateClipResult> {
  const submitted = await fetchJson<CreatePredictionResponse>("/api/video/replicate/generate", {
    prompt: options.prompt,
  }, getReplicateHeaders());

  if (!submitted.predictionId) {
    throw new Error("Replicate accepted the request but returned no prediction ID. Check the Replicate dashboard before retrying.");
  }
  options.onProgress?.("Replicate minimax/video-01 accepted the Try-for-Free prediction. Waiting for the video…");

  let completed = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await wait(3_000);
    const status = await fetchJson<PredictionStatusResponse>("/api/video/replicate/status", {
      predictionId: submitted.predictionId,
    }, getReplicateHeaders());
    if (status.status === "succeeded" && status.outputReady) {
      completed = true;
      break;
    }
    if (status.status === "failed" || status.status === "canceled") {
      throw new Error(normalisePredictionError(status.error));
    }
    options.onProgress?.("Replicate video is " + status.status + "…");
  }

  if (!completed) {
    throw new Error("The Replicate prediction is still running after six minutes. Check the Replicate dashboard before retrying to avoid duplicate use.");
  }

  options.onProgress?.("Downloading the completed Replicate video…");
  let response: Response;
  try {
    response = await fetch("/api/video/replicate/download", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "video/mp4", ...getReplicateHeaders() },
      body: JSON.stringify({ predictionId: submitted.predictionId }),
      cache: "no-store",
    });
  } catch {
    throw new Error("The Replicate video download could not be reached.");
  }
  if (!response.ok) {
    let message = "The completed Replicate clip could not be downloaded.";
    try {
      const payload: unknown = await response.json();
      if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Preserve the default message.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  if (!blob.size || blob.size > 24 * 1024 * 1024) {
    throw new Error("The Replicate video is empty or exceeds the 24 MB local per-scene media limit.");
  }
  if (blob.type && !blob.type.toLowerCase().includes("video")) {
    throw new Error("Replicate returned a file that was not recognised as video.");
  }
  return {
    blob: new Blob([blob], { type: "video/mp4" }),
    model: "minimax/video-01",
    seconds: 6,
  };
}
