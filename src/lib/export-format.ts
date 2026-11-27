export type VideoFileExtension = "mp4" | "webm";

export function shouldUseWebmFallback(
  hasMp4VideoEncoder: boolean,
  hasMp4AudioEncoder: boolean,
  audioTrackRequired: boolean,
): boolean {
  return !hasMp4VideoEncoder || (audioTrackRequired && !hasMp4AudioEncoder);
}

export function getVideoFileExtension(mimeType: string): VideoFileExtension {
  return mimeType.toLowerCase().includes("webm") ? "webm" : "mp4";
}
