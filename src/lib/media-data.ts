const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
]);

export const MAX_SCENE_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_NARRATION_AUDIO_BYTES = 30 * 1024 * 1024;

function readBase64DataUrl(value: unknown): { mimeType: string; byteLength: number } | null {
  if (typeof value !== "string") return null;
  const comma = value.indexOf(",");
  if (!value.startsWith("data:") || comma < 0) return null;

  const metadata = value.slice(5, comma).split(";");
  const mimeType = (metadata.shift() ?? "").trim().toLowerCase();
  if (!metadata.some((part) => part.trim().toLowerCase() === "base64")) return null;

  const payload = value.slice(comma + 1);
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 !== 0) return null;

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return { mimeType, byteLength: Math.max(0, (payload.length / 4) * 3 - padding) };
}

export function getEmbeddedImageSize(value: unknown): number | null {
  const media = readBase64DataUrl(value);
  if (!media || !IMAGE_MIME_TYPES.has(media.mimeType)) return null;
  return media.byteLength;
}

export function getEmbeddedAudioSize(value: unknown): number | null {
  const media = readBase64DataUrl(value);
  if (!media || !media.mimeType.startsWith("audio/")) return null;
  return media.byteLength;
}

export function isSupportedImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.trim().toLowerCase());
}
