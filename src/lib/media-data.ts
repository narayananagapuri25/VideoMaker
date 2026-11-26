import type { Scene } from "../types";

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
]);

export const MAX_SCENE_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_SCENE_VIDEO_BYTES = 24 * 1024 * 1024;
export const MAX_NARRATION_AUDIO_BYTES = 30 * 1024 * 1024;
export const MAX_PROJECT_MEDIA_BYTES = 64 * 1024 * 1024;

function readBase64DataUrl(value: unknown): { mimeType: string; payload: string; byteLength: number } | null {
  if (typeof value !== "string") return null;
  const comma = value.indexOf(",");
  if (!value.startsWith("data:") || comma < 0) return null;

  const metadata = value.slice(5, comma).split(";");
  const mimeType = (metadata.shift() ?? "").trim().toLowerCase();
  if (!metadata.some((part) => part.trim().toLowerCase() === "base64")) return null;

  const payload = value.slice(comma + 1);
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 !== 0) return null;

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return { mimeType, payload, byteLength: Math.max(0, (payload.length / 4) * 3 - padding) };
}

function imageHeaderMatches(mimeType: string, payload: string): boolean {
  try {
    const prefix = atob(payload.slice(0, 64));
    const bytes = Array.from(prefix, (character) => character.charCodeAt(0));
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    if (mimeType === "image/png") return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
    if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === "image/gif") return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    if (mimeType === "image/bmp") return ascii(0, 2) === "BM";
    if (mimeType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    if (mimeType === "image/avif") return ascii(4, 8) === "ftyp" && (ascii(8, 12) === "avif" || ascii(8, 12) === "avis" || ascii(8, 12) === "mif1");
  } catch {
    return false;
  }
  return false;
}

export function getEmbeddedImageSize(value: unknown): number | null {
  const media = readBase64DataUrl(value);
  if (!media || !IMAGE_MIME_TYPES.has(media.mimeType) || !imageHeaderMatches(media.mimeType, media.payload)) return null;
  return media.byteLength;
}

export function getEmbeddedAudioSize(value: unknown): number | null {
  const media = readBase64DataUrl(value);
  if (!media || !media.mimeType.startsWith("audio/")) return null;
  return media.byteLength;
}

export function getEmbeddedVideoSize(value: unknown): number | null {
  const media = readBase64DataUrl(value);
  if (!media || !new Set(["video/mp4", "video/webm"]).has(media.mimeType)) return null;
  try {
    const prefix = atob(media.payload.slice(0, 32));
    const bytes = Array.from(prefix, (character) => character.charCodeAt(0));
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    const validMp4 = media.mimeType === "video/mp4" && ascii(4, 8) === "ftyp";
    const validWebm = media.mimeType === "video/webm" && bytes.slice(0, 4).join(",") === "26,69,223,163";
    return validMp4 || validWebm ? media.byteLength : null;
  } catch {
    return null;
  }
}

export function getProjectMediaSize(scenes: Scene[], voiceAudioDataUrl?: string, replacingSceneId?: string, replacingAudio = false, replacingVideoSceneId?: string): number {
  const imageBytes = scenes.reduce((total, scene) => {
    if (replacingSceneId && scene.id === replacingSceneId) return total;
    return total + (getEmbeddedImageSize(scene.imageDataUrl) ?? 0);
  }, 0);
  const videoBytes = scenes.reduce((total, scene) => {
    if (replacingVideoSceneId && scene.id === replacingVideoSceneId) return total;
    return total + (getEmbeddedVideoSize(scene.videoDataUrl) ?? 0);
  }, 0);
  const audioBytes = replacingAudio ? 0 : (getEmbeddedAudioSize(voiceAudioDataUrl) ?? 0);
  return imageBytes + videoBytes + audioBytes;
}

export function isSupportedImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType.trim().toLowerCase());
}
