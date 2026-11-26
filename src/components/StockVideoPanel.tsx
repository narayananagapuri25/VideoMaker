import { useState } from "react";
import type { ChangeEvent } from "react";
import type { Scene } from "../types";
import { getSceneVideoSrc, searchStockVideos, type StockVideoResult } from "../lib/stock-video";
import { getEmbeddedVideoSize, MAX_SCENE_VIDEO_BYTES } from "../lib/media-data";

interface StockVideoPanelProps {
  scene: Scene;
  onChange: (patch: Partial<Scene>) => void;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The selected video could not be read."));
    reader.readAsDataURL(file);
  });
}

export default function StockVideoPanel({ scene, onChange }: StockVideoPanelProps) {
  const [query, setQuery] = useState(scene.title || "");
  const [results, setResults] = useState<StockVideoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const selectedSrc = getSceneVideoSrc(scene, "small");

  async function search() {
    setIsSearching(true);
    setError("");
    try {
      const found = await searchStockVideos(query);
      setResults(found);
      if (!found.length) setError("No matching clips found. Try a broader phrase such as “Earth from space” or “ocean waves”.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stock-video search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  async function importLocalVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!["video/mp4", "video/webm"].includes(file.type.toLowerCase())) {
        throw new Error("Choose an MP4 or WebM video file.");
      }
      if (file.size > MAX_SCENE_VIDEO_BYTES) {
        throw new Error("Keep each imported video under 24 MB. Use the Pixabay clip search for longer footage.");
      }
      const dataUrl = await readFile(file);
      if (getEmbeddedVideoSize(dataUrl) === null) throw new Error("The file contents do not match a supported MP4 or WebM video.");
      onChange({
        videoDataUrl: dataUrl,
        videoClipSource: "local",
        videoClipName: file.name,
        videoClipId: undefined,
        videoClipAuthor: undefined,
        videoClipPageUrl: undefined,
        videoClipDuration: undefined,
        videoClipStart: 0,
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import this video.");
    } finally {
      event.target.value = "";
    }
  }

  function chooseClip(clip: StockVideoResult) {
    onChange({
      videoDataUrl: undefined,
      videoClipSource: "pixabay",
      videoClipId: clip.id,
      videoClipName: `Pixabay clip #${clip.id}`,
      videoClipAuthor: clip.author,
      videoClipPageUrl: clip.pageUrl,
      videoClipDuration: clip.duration,
      videoClipStart: 0,
    });
  }

  return (
    <section className="stock-video-panel">
      <div className="stock-video-heading">
        <div><strong>REAL VIDEO FOOTAGE</strong><small>Choose moving footage for this scene, or import your own clip.</small></div>
        <span className={selectedSrc ? "clip-status ready" : "clip-status"}>{selectedSrc ? "CLIP ADDED" : "NO CLIP"}</span>
      </div>

      {selectedSrc && (
        <div className="selected-video">
          <video key={selectedSrc} src={selectedSrc} controls muted playsInline preload="metadata" />
          <div className="selected-video-meta">
            <span>{scene.videoClipName || "Selected video"}</span>
            {scene.videoClipAuthor && <small>Footage by {scene.videoClipAuthor} · Pixabay</small>}
            {scene.videoClipPageUrl && <a href={scene.videoClipPageUrl} target="_blank" rel="noreferrer">View original clip ↗</a>}
          </div>
          <button className="text-button remove-artwork" onClick={() => onChange({
            videoDataUrl: undefined, videoClipSource: undefined, videoClipId: undefined,
            videoClipName: undefined, videoClipAuthor: undefined, videoClipPageUrl: undefined,
            videoClipDuration: undefined, videoClipStart: undefined,
          })}>Remove video clip</button>
        </div>
      )}

      <div className="stock-video-search">
        <label className="field-label">SEARCH PIXABAY VIDEO LIBRARY</label>
        <div className="stock-video-search-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="e.g. Earth from space, ocean waves" />
          <button className="button button-secondary" disabled={isSearching || query.trim().length < 2} onClick={() => void search()}>
            {isSearching ? <><span className="spinner" /> Searching…</> : "Search clips"}
          </button>
        </div>
      </div>

      {error && <p className="stock-video-error" role="status">{error}</p>}
      {results.length > 0 && (
        <div className="stock-video-results">
          {results.map((clip) => (
            <article className="stock-video-result" key={clip.id}>
              <img src={clip.thumbnailUrl} alt="" loading="lazy" />
              <div className="stock-video-result-meta">
                <strong>{clip.duration}s clip</strong>
                <small>{clip.width} × {clip.height} · by {clip.author}</small>
                <a href={clip.pageUrl} target="_blank" rel="noreferrer">Pixabay source ↗</a>
                <button className="button button-primary" onClick={() => chooseClip(clip)}>Use this video</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="local-video-import">
        <label className="button button-secondary file-button">↑ Import MP4 / WebM<input type="file" accept="video/mp4,video/webm" onChange={importLocalVideo} /></label>
        <small>Local clips stay in this browser project. Up to 24 MB per clip; the combined project media limit still applies.</small>
      </div>
      <small className="stock-video-credit">Search results are provided by <a href="https://pixabay.com/" target="_blank" rel="noreferrer">Pixabay</a>. Check the licence and any recognizable people, brands or property before commercial publication.</small>
    </section>
  );
}
