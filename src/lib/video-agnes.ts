import { getAgnesConnectionHeaders, getAgnesHeaders } from "./ai-provider-session";

export interface AgnesConnection {
  connected: boolean;
  modelAvailable: boolean;
  model: string;
  resolution: string;
  minimumSeconds: number;
  maximumSeconds: number;
  defaultUserVideoRpm: number;
  trialPrice: string;
  message: string;
}

export interface AgnesClipResult {
  blob: Blob;
  model: "agnes-video-2.5-flash";
  seconds: number;
  resolution: "720P";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The Agnes video service returned an unreadable response.");
  }
  if (!response.ok) {
    const record = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const message = typeof record.error === "string"
      ? record.error
      : "Agnes video request failed (HTTP " + response.status + ").";
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
    throw new Error("The Agnes API could not be reached from SochoZara Studio.");
  }
  return readJsonResponse<T>(response);
}

export async function checkAgnesConnection(): Promise<AgnesConnection> {
  return fetchJson<AgnesConnection>("/api/video/agnes/connection", {}, getAgnesConnectionHeaders());
}

interface CreateTaskResponse {
  videoId: string;
  model: "agnes-video-2.5-flash";
  resolution: "720P";
  requestedSeconds: number;
  status: string;
}

interface TaskStatusResponse {
  videoId: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  url?: string;
  error?: unknown;
}

function normaliseTaskError(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.detail === "string") return record.detail;
  }
  return "Agnes video generation failed.";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

/** Free-promo model only. One clip is intentionally created per project because default-user video RPM is limited. */
export async function generateAgnesClip(options: {
  prompt: string;
  seconds: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  onProgress?: (message: string) => void;
}): Promise<AgnesClipResult> {
  const submitted = await fetchJson<CreateTaskResponse>("/api/video/agnes/generate", {
    prompt: options.prompt,
    seconds: options.seconds,
    aspectRatio: options.aspectRatio,
  }, getAgnesHeaders());

  if (!submitted.videoId) throw new Error("Agnes accepted the request but returned no video ID. Check the Agnes dashboard before retrying.");
  options.onProgress?.("Agnes Video 2.5 Flash accepted the 720p job. Waiting for the render…");

  let completed: TaskStatusResponse | null = null;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await wait(3_000);
    const status = await fetchJson<TaskStatusResponse>("/api/video/agnes/status", {
      videoId: submitted.videoId,
    }, getAgnesHeaders());
    if (status.status === "completed" && status.url) {
      completed = status;
      break;
    }
    if (status.status === "failed") {
      throw new Error(normaliseTaskError(status.error));
    }
    const progress = typeof status.progress === "number" ? " · " + status.progress + "%" : "";
    options.onProgress?.("Agnes video is " + status.status + progress + "…");
  }

  if (!completed) {
    throw new Error("Agnes is still processing this video after 4.5 minutes. The task may continue; check the Agnes dashboard before retrying.");
  }

  options.onProgress?.("Downloading the completed Agnes 720p clip…");
  let response: Response;
  try {
    response = await fetch("/api/video/agnes/download", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "video/mp4", ...getAgnesHeaders() },
      body: JSON.stringify({ videoId: submitted.videoId }),
      cache: "no-store",
    });
  } catch {
    throw new Error("The Agnes video download could not be reached.");
  }
  if (!response.ok) {
    let message = "The completed Agnes clip could not be downloaded.";
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
    throw new Error("The Agnes video is empty or exceeds the 24 MB local per-scene media limit.");
  }
  if (blob.type && !blob.type.toLowerCase().includes("video")) {
    throw new Error("Agnes returned a file that was not recognised as video.");
  }
  return {
    blob: new Blob([blob], { type: "video/mp4" }),
    model: "agnes-video-2.5-flash",
    seconds: options.seconds,
    resolution: "720P",
  };
}
