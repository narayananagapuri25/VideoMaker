export type VideoFileExtension = "mp4" | "webm";

export function shouldUseWebmFallback(
  hasMp4VideoEncoder: boolean,
  hasMp4AudioEncoder: boolean,
  narrationRequired: boolean,
): boolean {
  return !hasMp4VideoEncoder || (narrationRequired && !hasMp4AudioEncoder);
}

export function getVideoFileExtension(mimeType: string): VideoFileExtension {
  return mimeType.toLowerCase().includes("webm") ? "webm" : "mp4";
}
