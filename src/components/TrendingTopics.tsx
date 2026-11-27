import { useState } from "react";
import { loadTrendingTopics } from "../lib/trends";
import type { TrendingTopic } from "../types";

interface TrendingTopicsProps {
  onChoose: (topic: TrendingTopic, region: string) => void;
}

const REGIONS = [
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "JP", label: "Japan" },
  { code: "BR", label: "Brazil" },
  { code: "SG", label: "Singapore" },
];

export default function TrendingTopics({ onChoose }: TrendingTopicsProps) {
  const [expanded, setExpanded] = useState(false);
  const [region, setRegion] = useState("IN");
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedRegion, setLoadedRegion] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const next = await loadTrendingTopics(region);
      setTopics(next);
      setLoadedRegion(region);
      setExpanded(true);
    } catch (reason) {
      setTopics([]);
      setLoadedRegion("");
      setError(reason instanceof Error ? reason.message : "Trending topics could not be loaded.");
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="trending-panel" aria-label="Trending topic discovery">
      <div className="trending-toolbar">
        <div className="trending-heading">
          <strong>✦ What's trending?</strong>
          <small>Google Trends · free · no API key</small>
        </div>
        <select aria-label="Trending topics region" value={region} onChange={(event) => { setRegion(event.target.value); setTopics([]); setLoadedRegion(""); setError(""); }}>
          {REGIONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
        <button type="button" className="button button-secondary trending-refresh" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Loading…" : loadedRegion === region ? "Refresh" : "Explore"}
        </button>
      </div>
      {expanded && (
        <div className="trending-results" aria-live="polite">
          {loading && <p className="trending-message">Loading current search trends…</p>}
          {error && <p className="trending-message trending-error">{error}</p>}
          {!loading && !error && topics.map((topic, index) => (
            <button type="button" className="trend-topic" key={topic.title} onClick={() => onChoose(topic, region)}>
              <span className="trend-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="trend-copy">
                <strong>{topic.title}</strong>
                <small>{topic.traffic}{topic.relatedNews[0]?.source ? " · " + topic.relatedNews[0].source : ""}</small>
              </span>
              <span className="trend-use">Use topic ↗</span>
            </button>
          ))}
          {!loading && !error && topics.length === 0 && <p className="trending-message">No trends are available right now. You can still enter any idea below.</p>}
          <p className="trending-footnote">Trend volume is an approximate search signal, not proof that a story is true or important. Current claims need verification.</p>
        </div>
      )}
    </section>
  );
}
