import type { AspectRatio, Scene, StudioProject } from "../types";

export const GOOGLE_FLOW_URL = "https://labs.google/fx/tools/flow";

export function buildGoogleFlowVideoPrompt(scene: Scene, aspectRatio: AspectRatio): string {
  const composition = aspectRatio === "9:16"
    ? "Vertical portrait 9:16 composition, designed for a mobile-first documentary short. Keep the principal action in the central safe area."
    : "Horizontal cinematic 16:9 composition, designed for a documentary explainer.";

  const visual = scene.visualPrompt.trim() || scene.caption.trim() || scene.narration.trim();
  const context = scene.narration.trim();

  return [
    "Create one coherent, premium-quality animated video shot for an educational documentary.",
    "SCENE: " + scene.title.trim() + ".",
    "VISUAL ACTION: " + visual,
    context ? "STORY CONTEXT (visual guidance only; do not display or speak these words): " + context : "",
    "CAMERA AND MOTION: Use continuous, physically believable movement, deliberate cinematic camera motion, layered depth and natural motion blur. Show a clear visual change during the shot; do not make a still image with a zoom effect.",
    "VISUAL STYLE: Cinematic 3D documentary realism, detailed materials, realistic lighting, rich atmospheric depth, elegant restrained colour grading, polished professional science-channel production.",
    "COMPOSITION: " + composition,
    "OUTPUT: Aim for approximately " + Math.max(4, Math.min(12, Math.round(scene.duration))) + " seconds. One continuous shot with a clean beginning and end so it can be edited into a longer sequence.",
    "STRICT EXCLUSIONS: No written words, captions, subtitles, labels, numbers, logos, watermarks, borders or UI. No narration or lip-synced dialogue. SochoZara Studio will add the narration, captions and branding during final editing.",
    "ACCURACY: Treat the scene as an illustrative visualisation, not real news or archival footage. Keep the physical action internally consistent; do not add unrelated objects or spectacle."
  ].filter(Boolean).join("\n\n");
}

export function buildGoogleFlowShotList(project: StudioProject): string {
  const heading = [
    "SOCHOZARA STUDIO — GOOGLE FLOW SHOT LIST",
    "Project: " + project.title,
    "Topic: " + project.topic,
    "Format: " + project.aspectRatio,
    "Language: " + project.language,
    "Target duration: " + project.targetDuration + " seconds",
    "",
    "WORKFLOW",
    "1. Open Google Flow and create one clip per numbered scene, using the matching prompt below.",
    "2. Keep the same visual style and recurring subjects across scenes.",
    "3. Download each generated video as MP4 and name it scene-01.mp4, scene-02.mp4, etc.",
    "4. Return to SochoZara Studio and import each MP4 into its matching scene.",
    "5. Preview the complete timeline, confirm footage rights, add narration audio and export the final MP4.",
    "",
    "PROMPTS",
  ];
  const scenes = project.scenes.flatMap((scene, index) => [
    "",
    "============================================================",
    "SCENE " + String(index + 1).padStart(2, "0") + " — " + scene.title,
    "Timeline: " + scene.duration + " seconds",
    "Narration for editor sync: " + scene.narration,
    "",
    buildGoogleFlowVideoPrompt(scene, project.aspectRatio),
  ]);
  return [...heading, ...scenes, ""].join("\n");
}
