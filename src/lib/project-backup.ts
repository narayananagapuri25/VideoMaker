import type { AspectRatio, Language, Scene, StudioProject, VisualProvider } from "../types";
import { getEmbeddedAudioSize, getEmbeddedImageSize, MAX_NARRATION_AUDIO_BYTES, MAX_PROJECT_MEDIA_BYTES, MAX_SCENE_IMAGE_BYTES } from "./media-data";

export const MAX_PROJECT_BACKUP_BYTES = 80 * 1024 * 1024;
export const MAX_PROJECT_SCENES = 80;

const targetDurations = new Set([30, 45, 60, 90, 300, 480]);
const languages = new Set<Language>(["Hinglish", "Hindi", "English", "Telugu"]);
const aspectRatios = new Set<AspectRatio>(["9:16", "16:9"]);
const visualProviders = new Set<VisualProvider>(["adobe-firefly", "pexels", "other"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, fallback: string, maxLength: number, label: string): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new Error("The backup contains an invalid " + label + ".");
  if (value.length > maxLength) throw new Error("The backup " + label + " is too long.");
  return value;
}

function optionalText(value: unknown, maxLength: number, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return boundedText(value, "", maxLength, label);
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? ("import-" + Date.now() + "-" + Math.random().toString(16).slice(2));
}

function importedId(value: unknown, fallback: string, used: Set<string>): string {
  const candidate = typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : fallback;
  if (used.has(candidate)) {
    let unique = fallback;
    while (used.has(unique)) unique = newId();
    used.add(unique);
    return unique;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Validates and normalises an untrusted JSON backup before it enters IndexedDB.
 * Imported artwork always requires a fresh rights confirmation on this device.
 */
export function restoreProjectBackup(value: unknown): StudioProject {
  if (!isRecord(value)) throw new Error("This file is not a valid SochoZara project backup.");

  const title = boundedText(value.title, "", 240, "project title").trim();
  const topic = boundedText(value.topic, "", 5_000, "topic").trim();
  const script = boundedText(value.script, "", 60_000, "script");
  if (!title || !topic || !Array.isArray(value.scenes) || value.scenes.length === 0) {
    throw new Error("This file is not a valid SochoZara project backup.");
  }
  if (value.scenes.length > MAX_PROJECT_SCENES) {
    throw new Error("This backup contains too many scenes. Keep a project to 80 scenes or fewer.");
  }

  const usedIds = new Set<string>();
  let mediaBytes = 0;
  const scenes: Scene[] = value.scenes.map((entry, index) => {
    if (!isRecord(entry)) throw new Error("This backup contains an invalid scene.");

    let imageDataUrl: string | undefined;
    if (entry.imageDataUrl !== undefined && entry.imageDataUrl !== null && entry.imageDataUrl !== "") {
      const size = getEmbeddedImageSize(entry.imageDataUrl);
      if (size === null || size > MAX_SCENE_IMAGE_BYTES) {
        throw new Error("This backup contains an unsupported, external or oversized scene image. Use an embedded PNG, JPEG, WebP, GIF, AVIF or BMP image under 12 MB.");
      }
      mediaBytes += size;
      imageDataUrl = entry.imageDataUrl as string;
    }

    const id = importedId(entry.id, "scene-" + index + "-" + newId(), usedIds);
    const imageProvider = typeof entry.imageProvider === "string" && visualProviders.has(entry.imageProvider as VisualProvider)
      ? entry.imageProvider as VisualProvider
      : undefined;

    return {
      id,
      title: boundedText(entry.title, "Scene " + (index + 1), 200, "scene title"),
      narration: boundedText(entry.narration, "", 12_000, "scene narration"),
      caption: boundedText(entry.caption, "", 3_000, "scene caption"),
      visualPrompt: boundedText(entry.visualPrompt, "", 6_000, "visual prompt"),
      duration: finiteNumber(entry.duration, 5, 1, 90),
      imageDataUrl,
      imageProvider,
      imageSourceNote: optionalText(entry.imageSourceNote, 1_000, "image source note"),
      imageCommercialUseConfirmed: false,
    };
  });

  let voiceAudioDataUrl: string | undefined;
  if (value.voiceAudioDataUrl !== undefined && value.voiceAudioDataUrl !== null && value.voiceAudioDataUrl !== "") {
    const size = getEmbeddedAudioSize(value.voiceAudioDataUrl);
    if (size === null || size > MAX_NARRATION_AUDIO_BYTES) {
      throw new Error("This backup contains an unsupported, external or oversized narration file. Use embedded audio under 30 MB.");
    }
    mediaBytes += size;
    voiceAudioDataUrl = value.voiceAudioDataUrl as string;
  }
  if (mediaBytes > MAX_PROJECT_MEDIA_BYTES) {
    throw new Error("The combined images and audio in this backup exceed the 64 MB project media limit. Reduce media sizes and try again.");
  }

  const language = typeof value.language === "string" && languages.has(value.language as Language)
    ? value.language as Language
    : "Hinglish";
  const aspectRatio = typeof value.aspectRatio === "string" && aspectRatios.has(value.aspectRatio as AspectRatio)
    ? value.aspectRatio as AspectRatio
    : "9:16";
  const targetDuration = targetDurations.has(Number(value.targetDuration))
    ? Number(value.targetDuration)
    : 45;
  const id = typeof value.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value.id) ? value.id : newId();

  return {
    id,
    title,
    topic,
    language,
    aspectRatio,
    targetDuration,
    script,
    scenes,
    storyboardSourceTopic: optionalText(value.storyboardSourceTopic, 5_000, "storyboard topic"),
    storyboardSourceScript: optionalText(value.storyboardSourceScript, 60_000, "storyboard script"),
    storyboardSourceTargetDuration: typeof value.storyboardSourceTargetDuration === "number" && Number.isFinite(value.storyboardSourceTargetDuration)
      ? finiteNumber(value.storyboardSourceTargetDuration, targetDuration, 10, 600)
      : undefined,
    storyboardSourceAspectRatio: typeof value.storyboardSourceAspectRatio === "string" && aspectRatios.has(value.storyboardSourceAspectRatio as AspectRatio)
      ? value.storyboardSourceAspectRatio as AspectRatio
      : undefined,
    storyboardSourceLanguage: typeof value.storyboardSourceLanguage === "string" && languages.has(value.storyboardSourceLanguage as Language)
      ? value.storyboardSourceLanguage as Language
      : undefined,
    editorialNote: optionalText(value.editorialNote, 8_000, "editorial note"),
    voiceAudioDataUrl,
    voiceAudioName: optionalText(value.voiceAudioName, 200, "audio filename"),
    updatedAt: Date.now(),
  };
}
