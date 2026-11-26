export type AspectRatio = "9:16" | "16:9";
export type Language = "Hinglish" | "Hindi" | "English" | "Telugu";
export type VisualProvider = "adobe-firefly" | "pexels" | "other";

export interface Scene {
  id: string;
  title: string;
  narration: string;
  caption: string;
  visualPrompt: string;
  duration: number;
  imageDataUrl?: string;
  imageProvider?: VisualProvider;
  imageSourceNote?: string;
  imageCommercialUseConfirmed?: boolean;
}

export interface StudioProject {
  id: string;
  title: string;
  topic: string;
  language: Language;
  aspectRatio: AspectRatio;
  targetDuration: number;
  script: string;
  scenes: Scene[];
  /** Last topic and script used to build this storyboard; stale drafts cannot be exported. */
  storyboardSourceTopic?: string;
  storyboardSourceScript?: string;
  /** Research/editorial caveat shown in the editor, never included in narration. */
  editorialNote?: string;
  voiceAudioDataUrl?: string;
  voiceAudioName?: string;
  updatedAt: number;
}

export interface GeneratedStory {
  title: string;
  script: string;
  scenes: Array<Omit<Scene, "id">>;
  editorialNote?: string;
}