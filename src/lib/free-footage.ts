import type { Scene } from "../types";
import { searchStockVideos } from "./stock-video";

export interface FreeFootageResult {
  scenes: Scene[];
  attachedTitles: string[];
  skipped: number;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "about", "what", "why", "how", "this", "that",
  "their", "they", "then", "when", "where", "over", "under", "through", "your", "video", "scene",
  "cinematic", "documentary", "visual", "image", "footage", "shot", "beautiful", "detailed", "view",
  "close", "wide", "dramatic", "modern", "premium", "concept", "illustration", "realistic",
]);

function normaliseTerm(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function sceneTerms(scene: Scene): string[] {
  const words = (scene.topicContext + " " + scene.title + " " + scene.narration + " " + scene.caption + " " + scene.visualPrompt)
    .toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const unique = [...new Set(words.filter((word) => !STOP_WORDS.has(word)).map(normaliseTerm))];
  return unique.slice(0, 8);
}

function queryForScene(scene: Scene): string {
  const context = (scene.topicContext + " " + scene.title + " " + scene.narration).toLowerCase();
  const local = (scene.title + " " + scene.narration + " " + scene.caption).toLowerCase();
  if (/\b(cricket|ipl|rohit sharma|mumbai indians|wankhede)\b/.test(context)) {
    if (/trophy|champion|title|legacy|golden era|five seasons/.test(local)) return "cricket trophy presentation champions five titles";
    if (/arshdeep|hardik|trade|transfer|roster|squad|joins|bowler/.test(local)) return "cricket fast bowler bowling action stadium";
    if (/20th|twentieth|landmark|season|anniversary/.test(local)) return "cricket stadium crowd floodlights night match";
    if (/prediction|question|final|wankhede|trophy back/.test(local)) return "cricket batsman batting shot ball field stadium";
    if (/captain|captaincy|return|comeback|leadership/.test(local)) return "cricket captain walking onto stadium field batting";
    return "cricket stadium batting action crowd floodlights";
  }
  return sceneTerms(scene).slice(0, 6).join(" ").slice(0, 100);
}

function relevanceScore(scene: Scene, tags: string[]): number {
  const wanted = new Set(sceneTerms(scene));
  const candidate = new Set(tags.flatMap((tag) =>
    (tag.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).map(normaliseTerm),
  ));
  let score = 0;
  for (const term of wanted) if (candidate.has(term)) score += 1;
  return score;
}

/** Searches broad, free Pixabay stock footage for scenes in any genre; the API key is optional configuration. */
export async function attachFreePixabayFootage(
  scenes: Scene[],
  onProgress?: (message: string) => void,
  maxAttachments = 3,
): Promise<FreeFootageResult> {
  const output = [...scenes];
  const total = Math.max(0, Math.min(3, maxAttachments));
  if (!total || !scenes.length) return { scenes: output, attachedTitles: [], skipped: 0 };

  // Spread searches across the whole story so one opening sequence does not consume every clip slot.
  const positions = [...new Set([
    0,
    Math.round((scenes.length - 1) / 2),
    scenes.length - 1,
  ])].slice(0, total);
  const used = new Set<number>();
  const attachedTitles: string[] = [];
  let skipped = 0;

  for (const index of positions) {
    const scene = output[index];
    if (!scene || scene.videoClipSource || scene.videoDataUrl) continue;
    const query = queryForScene(scene);
    if (query.length < 2) { skipped += 1; continue; }
    try {
      onProgress?.("Searching free stock footage · " + scene.title + "…");
      const candidates = await searchStockVideos(query);
      const ranked = candidates
        .filter((candidate) => !used.has(candidate.id) && candidate.duration >= 3 && (candidate.tags?.length ?? 0) > 0)
        .map((candidate) => ({ candidate, score: relevanceScore(scene, candidate.tags ?? []) }))
        .sort((left, right) => right.score - left.score || right.candidate.duration - left.candidate.duration);
      const best = ranked[0];
      // A minimum semantic match avoids attaching popular but unrelated generic stock footage.
      if (!best || best.score < 2) { skipped += 1; continue; }
      used.add(best.candidate.id);
      output[index] = {
        ...scene,
        videoClipSource: "pixabay",
        videoClipId: best.candidate.id,
        videoClipName: best.candidate.tags?.slice(0, 4).join(", ") || query,
        videoClipAuthor: best.candidate.author || "Pixabay contributor",
        videoClipPageUrl: best.candidate.pageUrl,
        videoClipDuration: best.candidate.duration,
        videoClipStart: 0,
        videoSourceNote: "Pixabay Content License · creator and source page credited in the rendered video. Check the source page for asset-specific restrictions before commercial campaigns.",
        videoRightsBasis: "pixabay-content-license",
        videoCommercialUseConfirmed: false,
      };
      attachedTitles.push(scene.title);
    } catch {
      skipped += 1;
    }
  }
  return { scenes: output, attachedTitles, skipped };
}
