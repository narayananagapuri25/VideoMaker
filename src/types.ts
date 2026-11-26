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
  videoClipSource?: "pixabay" | "local";
  videoClipId?: number;
  videoClipName?: string;
  videoClipAuthor?: string;
  videoClipPageUrl?: string;
  videoClipDuration?: number;
  videoClipStart?: number;
  videoDataUrl?: string;
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
  storyboardSourceTargetDuration?: number;
  storyboardSourceAspectRatio?: AspectRatio;
  /** Language used when the current storyboard was generated or last rebuilt. */
  storyboardSourceLanguage?: Language;
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