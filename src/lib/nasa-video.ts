import type { Scene } from "../types";

export interface NasaVideoResult {
  nasaId: string;
  title: string;
  description: string;
  keywords: string[];
  dateCreated: string;
  center: string;
  duration: number;
  thumbnailUrl: string;
  pageUrl: string;
  streamUrl: string;
  source: "NASA";
  rightsBasis: string;
}

interface NasaSearchResponse { results?: NasaVideoResult[]; error?: string; }

const TOPIC_TERMS = new Set([
  "earth", "planet", "space", "moon", "mars", "sun", "solar", "galaxy", "star", "orbit", "satellite",
  "rocket", "launch", "atmosphere", "ocean", "climate", "storm", "hurricane", "volcano", "wildfire",
  "glacier", "iceberg", "aurora", "cloud", "lightning", "weather", "telescope", "nebula", "asteroid",
  "comet", "eclipse", "rotation", "gravity", "corona", "coral", "tide", "sea", "river", "ice",
]);
const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "into", "about", "what", "why", "how", "this", "that", "over", "under", "view", "shot", "cinematic", "documentary", "visual", "scene", "image", "video", "photorealistic", "detailed", "light", "lighting", "natural", "dramatic"]);

function terms(text: string): string[] {
  return text.toLowerCase().match(/[a-z]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? [];
}

function queryForScene(scene: Scene): string {
  const text = [scene.title, scene.caption, scene.visualPrompt, scene.narration].join(" ");
  const words = terms(text);
  const preferred = words.filter((word) => TOPIC_TERMS.has(word));
  const chosen = [...new Set([...preferred, ...words.filter((word) => !TOPIC_TERMS.has(word))])].slice(0, 7);
  return chosen.join(" ");
}

function relevance(scene: Scene, candidate: NasaVideoResult): number {
  const titleTerms = new Set(terms(scene.title + " " + scene.caption));
  const promptTerms = new Set(terms(scene.visualPrompt + " " + scene.narration));
  const footageTitle = new Set(terms(candidate.title));
  const footageKeywords = new Set(terms(candidate.keywords.join(" ")));
  const footageDescription = new Set(terms(candidate.description));
  let score = 0;
  for (const term of titleTerms) {
    if (footageTitle.has(term)) score += 4;
    else if (footageKeywords.has(term)) score += 2.5;
    else if (footageDescription.has(term)) score += 1;
  }
  for (const term of promptTerms) {
    if (footageTitle.has(term)) score += 2;
    else if (footageKeywords.has(term)) score += 1.25;
  }
  return score;
}

export async function searchNasaVideos(query: string, signal?: AbortSignal): Promise<NasaVideoResult[]> {
  const clean = query.trim();
  if (clean.length < 2 || clean.length > 160) throw new Error("Enter a NASA video search phrase between 2 and 160 characters.");
  const response = await fetch("/api/stock/nasa-videos?q=" + encodeURIComponent(clean), {
    headers: { Accept: "application/json" },
    signal,
    cache: "force-cache",
  });
  let payload: NasaSearchResponse;
  try { payload = await response.json() as NasaSearchResponse; }
  catch { throw new Error("NASA video search returned an unreadable response."); }
  if (!response.ok) throw new Error(payload.error || "NASA video search failed (HTTP " + response.status + ").");
  return Array.isArray(payload.results) ? payload.results : [];
}

/** Adds at most three real, NASA-library clips to scenes with clear archive relevance. No API key or paid provider is used. */
export async function attachFreeNasaFootage(
  scenes: Scene[],
  onProgress?: (message: string) => void,
): Promise<{ scenes: Scene[]; attachedTitles: string[]; skipped: number }> {
  const output = [...scenes];
  const eligible = output.map((scene, index) => ({ scene, index, query: queryForScene(scene) }))
    .filter((entry) => entry.query && terms(entry.scene.title + " " + entry.scene.visualPrompt).some((word) => TOPIC_TERMS.has(word)))
    .slice(0, 3);
  const used = new Set<string>();
  const attachedTitles: string[] = [];
  let skipped = 0;
  for (const entry of eligible) {
    try {
      onProgress?.("Searching the free NASA footage library · " + entry.scene.title + "…");
      const candidates = await searchNasaVideos(entry.query);
      const ranked = candidates
        .filter((candidate) => !used.has(candidate.nasaId))
        .map((candidate) => ({ candidate, score: relevance(entry.scene, candidate) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      // Requiring a title/keyword match avoids placing generic space footage into unrelated scenes.
      if (!best || best.score < 2.5) { skipped += 1; continue; }
      used.add(best.candidate.nasaId);
      output[entry.index] = {
        ...entry.scene,
        videoClipSource: "nasa",
        videoClipRef: best.candidate.nasaId,
        videoClipName: best.candidate.title,
        videoClipAuthor: "NASA",
        videoClipPageUrl: best.candidate.pageUrl,
        videoClipDuration: best.candidate.duration || undefined,
        videoClipStart: 0,
        videoSourceNote: "NASA Image and Video Library · educational/informational footage. NASA source credit is included in the video. This clip was screened to exclude flagged third-party copyright and identifiable-person descriptions; review NASA media guidelines before promotional or commercial use.",
        videoRightsBasis: "nasa-educational",
        videoCommercialUseConfirmed: false,
      };
      attachedTitles.push(entry.scene.title);
    } catch {
      skipped += 1;
    }
  }
  return { scenes: output, attachedTitles, skipped };
}
