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
        videoSourceNote: "Local video · confirm ownership or licence for this footage",
        videoCommercialUseConfirmed: false,
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
      videoSourceNote: "Pixabay Content License · verify any additional rights for depicted people, brands or property",
      videoCommercialUseConfirmed: false,
    });
  }

  return (
    <section className="stock-video-panel">
      <div className="stock-video-heading">
        <div><strong>OPTIONAL REAL FOOTAGE</strong><small>The built-in motion engine already animates this scene. Add stock or local footage only when you want a real-world video layer.</small></div>
        <span className={selectedSrc ? "clip-status ready" : "clip-status"}>{selectedSrc ? "FOOTAGE ADDED" : "MOTION READY"}</span>
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
            videoSourceNote: undefined, videoCommercialUseConfirmed: false,
          })}>Remove video clip</button>
        </div>
      )}

      {selectedSrc && (
        <div className="video-trim-control">
          <label className="field-label">CLIP IN POINT (SECONDS)</label>
          <input type="number" min="0" max={scene.videoClipDuration || 3600} step="0.1" value={scene.videoClipStart ?? 0} onChange={(event) => onChange({ videoClipStart: Math.max(0, Math.min(scene.videoClipDuration || 3600, Number(event.target.value) || 0)) })} />
          <small>The scene duration on the storyboard determines how long this footage plays. The clip loops only when the selected footage is shorter than the scene.</small>
        </div>
      )}

      {selectedSrc && (
        <div className="video-rights-box">
          <label className="field-label">FOOTAGE SOURCE / LICENCE NOTE</label>
          <input value={scene.videoSourceNote || ""} onChange={(event) => onChange({ videoSourceNote: event.target.value })} placeholder="Record source, creator and licence" />
          <label className="rights-confirm">
            <input type="checkbox" checked={Boolean(scene.videoCommercialUseConfirmed)} onChange={(event) => onChange({ videoCommercialUseConfirmed: event.target.checked })} />
            <span>I checked the source and confirm I have the rights and any required permissions to use this footage.</span>
          </label>
        </div>
      )}

      <div className="stock-video-search">
        <label className="field-label">OPTIONAL PIXABAY FOOTAGE</label>
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
