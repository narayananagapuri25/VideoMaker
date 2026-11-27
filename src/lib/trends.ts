import type { TrendingTopic } from "../types";

interface TrendsResponse {
  region?: string;
  source?: string;
  fetchedAt?: string;
  trends?: TrendingTopic[];
  error?: string;
}

export async function loadTrendingTopics(region = "IN", signal?: AbortSignal): Promise<TrendingTopic[]> {
  const allowed = new Set(["IN", "US", "GB", "CA", "AU", "DE", "FR", "JP", "BR", "SG"]);
  const code = region.toUpperCase();
  if (!allowed.has(code)) throw new Error("Choose a supported trends region.");
  const response = await fetch("/api/trends?region=" + encodeURIComponent(code), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  let payload: TrendsResponse;
  try {
    payload = await response.json() as TrendsResponse;
  } catch {
    throw new Error("The trends service returned an unreadable response.");
  }
  if (!response.ok) throw new Error(payload.error || "Could not load trending topics (HTTP " + response.status + ").");
  if (!Array.isArray(payload.trends)) throw new Error("The trends service returned no topic list.");
  return payload.trends;
}
