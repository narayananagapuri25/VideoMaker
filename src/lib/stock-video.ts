import type { Scene } from "../types";

export interface StockVideoResult {
  id: number;
  pageUrl: string;
  duration: number;
  author: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}

interface SearchResponse {
  totalHits?: number;
  results?: StockVideoResult[];
  error?: string;
}

export function getSceneVideoSrc(scene: Scene, quality: "small" | "medium" = "medium"): string | undefined {
  if (scene.videoDataUrl) return scene.videoDataUrl;
  if (scene.videoClipSource === "pixabay" && scene.videoClipId) {
    return `/api/stock/videos/${scene.videoClipId}?quality=${quality}`;
  }
  return undefined;
}

export async function searchStockVideos(query: string, signal?: AbortSignal): Promise<StockVideoResult[]> {
  const clean = query.trim();
  if (clean.length < 2) throw new Error("Enter at least two words to search for stock footage.");
  const response = await fetch(`/api/stock/videos?q=${encodeURIComponent(clean)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  let payload: SearchResponse;
  try {
    payload = await response.json() as SearchResponse;
  } catch {
    throw new Error(response.status === 404
      ? "The stock-video API route is not deployed. Publish the current Cloudflare Pages build."
      : "The stock-video service returned an unreadable response.");
  }
  if (!response.ok) throw new Error(payload.error || `Stock-video search failed (HTTP ${response.status}).`);
  return Array.isArray(payload.results) ? payload.results : [];
}
