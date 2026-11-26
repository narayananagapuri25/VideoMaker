export function createExportAbortError(): Error {
  const error = new Error("MP4 export canceled.");
  error.name = "AbortError";
  return error;
}

export function isExportAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function throwIfExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createExportAbortError();
}
