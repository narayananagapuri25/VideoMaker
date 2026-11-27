import type { Scene } from "../types";

export type SceneVisualMode = "footage" | "artwork-motion" | "procedural-motion";

/** Selects the local renderer's source without requiring an external video provider. */
export function getSceneVisualMode(scene: Scene): SceneVisualMode {
  if (scene.videoDataUrl || (scene.videoClipSource === "pixabay" && scene.videoClipId)) return "footage";
  return scene.imageDataUrl ? "artwork-motion" : "procedural-motion";
}

/** Only user-supplied/imported assets need a rights confirmation. In-house graphics are original. */
export function getUnverifiedSceneMedia(scenes: Scene[]): string[] {
  return scenes.flatMap((scene) => {
    const unverifiedImage = Boolean(scene.imageDataUrl && !scene.imageCommercialUseConfirmed && !scene.imageGeneratedByAI);
    const hasExternalVideo = Boolean(scene.videoDataUrl || (scene.videoClipSource === "pixabay" && scene.videoClipId));
    const unverifiedVideo = hasExternalVideo && !scene.videoGeneratedByAI && !scene.videoCommercialUseConfirmed;
    return unverifiedImage || unverifiedVideo ? [scene.title || "Untitled scene"] : [];
  });
}
