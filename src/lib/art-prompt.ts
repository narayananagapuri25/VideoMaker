import type { AspectRatio, Scene } from "../types";

export function buildSceneImagePrompt(scene: Scene, aspectRatio: AspectRatio): string {
  const ratio = aspectRatio === "9:16" ? "vertical portrait 9:16" : "horizontal landscape 16:9";
  const core = scene.visualPrompt.trim() || ("A cinematic visual illustrating: " + scene.narration);
  return [
    core,
    "Create one standalone scene image for an educational documentary video.",
    "Composition: " + ratio + ", clear subject, strong focal point, enough clean dark negative space for subtitles.",
    "SochoZara visual direction: premium cinematic documentary, midnight navy atmosphere, electric cyan highlights and restrained saffron-orange accents.",
    "Use realistic lighting, visual depth and a polished editorial finish.",
    "No text, lettering, logos, watermarks, borders, UI or fake archival labels.",
    "Do not depict a generated reconstruction as a real photograph or verified historical record."
  ].join("\n\n");
}
