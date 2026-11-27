import { useEffect, useRef, useState } from "react";
import { generateCloudflareNarration, generateCloudflareSceneImage, generateStory } from "./lib/ai";
import { generateNarration } from "./lib/tts";
import { loadLatestProject, saveProject } from "./lib/storage";
import { makeProject } from "./lib/story";
import { getTimelineDuration } from "./lib/timeline";
import { attachFreeNasaFootage } from "./lib/nasa-video";
import { attachFreePixabayFootage } from "./lib/free-footage";
import { getUnverifiedSceneMedia } from "./lib/video-generation";
import { getVideoFileExtension } from "./lib/export-format";
import {
  confirmSelectedAIFreeUseOnly,
  hasSelectedAIFreeUseConsent,
  hasSelectedAIKey,
  removeSelectedAIKey,
  saveSelectedAIKey,
  selectAIProvider,
  type SelectedAIProvider,
} from "./lib/ai-selection";
import PlaybackTimeline from "./components/PlaybackTimeline";
import TrendingTopics from "./components/TrendingTopics";
import type { AspectRatio, Language, Scene, StudioProject, TrendEditorialContext, TrendingTopic, VideoGenre } from "./types";

const initialProject = () => makeProject("What is happening today?", "English", "9:16", 45);

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
}

function safeFileName(value: string): string {
  return (value || "sochozara-video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sochozara-video";
}

const providerLabels: Record<SelectedAIProvider, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter · Free models",
  cloudflare: "Cloudflare Workers AI",
};

export default function App() {
  const [project, setProject] = useState<StudioProject>(initialProject);
  const [videoGenre, setVideoGenre] = useState<VideoGenre>("auto");
  const [trendContext, setTrendContext] = useState<TrendEditorialContext | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<SelectedAIProvider>(() => {
    // Cloudflare is the default production path. Preserve its existing Free-only consent.
    try { selectAIProvider("cloudflare"); } catch { /* The selection state remains safe in memory when storage is unavailable. */ }
    return "cloudflare";
  });
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(() => hasSelectedAIKey());
  const [freeUseConfirmed, setFreeUseConfirmed] = useState(() => hasSelectedAIFreeUseConsent());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [exportType, setExportType] = useState<"mp4" | "webm">("mp4");
  const [notice, setNotice] = useState("Choose an AI provider, enter your topic and generate your video.");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const exportUrlRef = useRef("");
  const renderAbortRef = useRef<AbortController | null>(null);

  const duration = getTimelineDuration(project.scenes);
  const needsFreeAttestation = selectedProvider === "gemini" || selectedProvider === "groq" || selectedProvider === "cloudflare";
  const needsApiKey = selectedProvider !== "cloudflare";
  const providerReady = (!needsApiKey || keySaved) && (!needsFreeAttestation || freeUseConfirmed);

  useEffect(() => {
    let mounted = true;
    loadLatestProject()
      .then((saved) => {
        if (!mounted || !saved) return;
        setProject(saved);
        setSelectedSceneId(saved.scenes[0]?.id ?? "");
      })
      .catch(() => {
        if (mounted) setNotice("A previous local project could not be opened. A fresh project is ready.");
      })
      .finally(() => {
        if (mounted) setIsLoaded(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    void saveProject(project).catch(() => setNotice("This browser could not save the project locally."));
  }, [project, isLoaded]);

  useEffect(() => () => {
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
  }, []);

  function clearExport() {
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    exportUrlRef.current = "";
    setExportUrl("");
    setExportType("mp4");
  }

  function handleTrendChoose(topic: TrendingTopic, region: string) {
    clearExport();
    setProject((current) => ({ ...current, topic: topic.title, updatedAt: Date.now() }));
    setTrendContext({
      source: "Google Trends",
      region,
      traffic: topic.traffic,
      publishedAt: topic.publishedAt,
      relatedNews: topic.relatedNews.slice(0, 3).map((item) => ({ title: item.title, source: item.source })),
    });
    setNotice("Selected a Google Trends topic. Headlines are research leads, not verified facts; the storyboard will flag claims that need checking.");
  }

  function handleProviderChange(value: string) {
    const provider = value as SelectedAIProvider;
    try {
      selectAIProvider(provider);
      setSelectedProvider(provider);
      setKeySaved(hasSelectedAIKey(provider));
      setFreeUseConfirmed(hasSelectedAIFreeUseConsent(provider));
      setApiKey("");
      setNotice("Selected " + providerLabels[provider] + ". Only this provider will receive generation requests.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change the AI provider.");
    }
  }

  function handleSaveKey() {
    try {
      saveSelectedAIKey(selectedProvider, apiKey);
      setApiKey("");
      setKeySaved(true);
      setFreeUseConfirmed(false);
      setNotice("API key saved for this browser tab only. Other AI provider keys were cleared from this tab.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the API key.");
    }
  }

  function handleFreeUseChange(checked: boolean) {
    try {
      confirmSelectedAIFreeUseOnly(selectedProvider, checked);
      setFreeUseConfirmed(checked);
      if (selectedProvider === "cloudflare") setKeySaved(checked);
      setNotice(checked
        ? "Free-tier-only use confirmed. The app will stop when this provider's free quota is exhausted."
        : "Generation is paused until free-tier-only use is confirmed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the free-tier confirmation.");
    }
  }

  function handleRemoveKey() {
    removeSelectedAIKey(selectedProvider);
    setKeySaved(false);
    setFreeUseConfirmed(false);
    setApiKey("");
    setNotice("The selected provider's API key was removed from this browser tab.");
  }

  async function renderProject(videoProject: StudioProject) {
    const unverified = getUnverifiedSceneMedia(videoProject.scenes);
    if (unverified.length) {
      setNotice("The saved project contains unverified imported media: " + unverified.join(", ") + ". Remove it in the original project before rendering.");
      return;
    }
    const controller = new AbortController();
    renderAbortRef.current = controller;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderMessage("Preparing 1080p cinematic scenes…");
    setIsPlaying(false);
    try {
      const { exportMp4 } = await import("./lib/renderer");
      const blob = await exportMp4(videoProject, ({ progress, message }) => {
        setRenderProgress(progress);
        setRenderMessage(message);
      }, controller.signal);
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      const url = URL.createObjectURL(blob);
      exportUrlRef.current = url;
      setExportUrl(url);
      const fileType = getVideoFileExtension(blob.type);
      setExportType(fileType);
      setNotice("Your video is ready. Select Download " + fileType.toUpperCase() + ".");
    } catch (error) {
      if (controller.signal.aborted) {
        setNotice("Rendering was cancelled.");
      } else {
        setNotice(error instanceof Error ? error.message : "Video rendering failed on this device.");
      }
    } finally {
      if (renderAbortRef.current === controller) renderAbortRef.current = null;
      setIsRendering(false);
    }
  }

  async function handleGenerateVideo() {
    if (!project.topic.trim()) {
      setNotice("Enter a topic first.");
      return;
    }
    if (!providerReady) {
      setNotice(selectedProvider === "cloudflare"
        ? "Confirm Cloudflare Workers Free use before generating. The Cloudflare Pages project must also have an AI binding named AI."
        : "Save your selected API key and confirm that the account has free-tier access with paid billing disabled.");
      return;
    }
    if (isGenerating || isRendering) return;
    clearExport();
    setIsGenerating(true);
    setNotice("Creating the story and directing the scenes with " + providerLabels[selectedProvider] + "…");
    try {
      const result = await generateStory({
        topic: project.topic.trim(),
        language: project.language,
        targetDuration: project.targetDuration,
        aspectRatio: project.aspectRatio,
        genre: videoGenre,
        trendContext,
      });
      let voiceAudioDataUrl: string | undefined;
      let voiceAudioName: string | undefined;
      let voiceNote = "";
      setNotice("Creating the voice-over first so optional scene artwork cannot consume the remaining free AI allowance…");

      const readAudioAsDataUrl = (audio: Blob): Promise<string> => new Promise((resolve, reject) => {
        if (!audio.size || !audio.type.startsWith("audio/")) {
          reject(new Error("The selected voice provider returned an empty or unsupported audio file."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const value = String(reader.result || "");
          if (!value.startsWith("data:audio/")) reject(new Error("The narration audio could not be prepared for export."));
          else resolve(value);
        };
        reader.onerror = () => reject(new Error("Could not prepare the generated narration audio."));
        reader.readAsDataURL(audio);
      });

      if (selectedProvider === "cloudflare") {
        if (project.language !== "English") {
          throw new Error("No video was exported: Cloudflare Aura-1 in this Studio currently supports English narration only. Select Gemini with its confirmed Free Tier for Hindi, Telugu or Hinglish. No paid voice provider was used.");
        }
        try {
          setNotice("Generating English narration with Cloudflare Aura-1 before scene artwork…");
          const audio = await generateCloudflareNarration(result.story.script, project.language);
          voiceAudioDataUrl = await readAudioAsDataUrl(audio);
          voiceAudioName = "Cloudflare Workers AI · Aura-1 · Luna";
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Aura-1 did not return a valid narration track.";
          throw new Error("No video was exported because the voice-over failed. " + detail + " The Cloudflare Free daily AI allowance is shared by storyboard, artwork and narration; narration now runs before artwork to protect the remaining allowance. Retry after the daily reset or select Gemini Free Tier. No paid fallback was called.");
        }
      } else if (selectedProvider === "gemini") {
        try {
          setNotice("Generating multilingual narration with Gemini Free Tier before scene artwork…");
          const narration = await generateNarration(result.story.script, "Kore", project.language);
          voiceAudioDataUrl = await readAudioAsDataUrl(narration.blob);
          voiceAudioName = narration.provider + " · Kore";
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Gemini did not return a valid narration track.";
          throw new Error("No video was exported because Gemini narration failed. " + detail + " Check the Gemini Free Tier quota and key configuration. This Studio will not switch to a paid voice provider or another account automatically.");
        }
      } else {
        throw new Error(providerLabels[selectedProvider] + " can create the script but does not provide a supported narration track in this Studio. Select Cloudflare for English or Gemini Free Tier for multilingual narration. No video was exported without voice-over.");
      }

      if (!voiceAudioDataUrl) {
        throw new Error("No spoken narration was produced, so the Studio stopped before rendering rather than exporting a silent video.");
      }
      voiceNote = " Voice-over generated with " + (voiceAudioName || "the selected free-tier provider") + ".";
      setNotice("Voice-over ready. Creating distinct visuals and matching free footage…");

      let scenes: Scene[] = result.story.scenes.map((scene, index) => ({
        ...scene,
        id: globalThis.crypto?.randomUUID?.() ?? ("scene-" + Date.now() + "-" + index),
      }));
      let visualNote = "";
      if (selectedProvider === "cloudflare") {
        const illustrated: Scene[] = [];
        for (let index = 0; index < scenes.length; index += 1) {
          const scene = scenes[index];
          setNotice("Creating original FLUX artwork · scene " + (index + 1) + " of " + scenes.length + "…");
          const visualPrompt = [
            "Premium cinematic still image for a professional " + (videoGenre === "auto" ? "genre-appropriate" : videoGenre) + " video. Match the actual scene setting, era, environment, and emotional tone; do not force an educational-documentary look onto unrelated subjects.",
            "Subject and visual direction: " + (scene.visualPrompt || scene.title),
            "Scene title for context only: " + scene.title,
            "Photorealistic, art-directed, rich environmental detail, strong composition, depth and natural lighting.",
            "No text, letters, numbers, logos, captions, watermarks, borders, UI or infographic labels.",
          ].join(" ").slice(0, 2_048);
          try {
            const imageDataUrl = await generateCloudflareSceneImage(visualPrompt);
            illustrated.push({
              ...scene,
              imageDataUrl,
              imageGeneratedByAI: true,
              imageProvider: "other",
              imageSourceNote: "Cloudflare Workers AI · FLUX.1 schnell",
            });
          } catch (error) {
            illustrated.push(...scenes.slice(index));
            visualNote = " AI artwork stopped at scene " + (index + 1) + ": " + (error instanceof Error ? error.message : "Cloudflare image generation failed") + ". Remaining scenes use original in-house motion graphics; no other AI provider was used.";
            break;
          }
        }
        scenes = illustrated;
      }

      let footageNote = "";
      try {
        // Pixabay covers broad genres; NASA is a specialised free archive fallback for relevant science/Earth scenes.
        // The combined cap keeps every generation to at most three external clips.
        const pixabayFootage = await attachFreePixabayFootage(scenes, setNotice, 3);
        scenes = pixabayFootage.scenes;
        const nasaFootage = await attachFreeNasaFootage(
          scenes,
          setNotice,
          Math.max(0, 3 - pixabayFootage.attachedTitles.length),
        );
        scenes = nasaFootage.scenes;
        const pixabayTitles = pixabayFootage.attachedTitles;
        const nasaTitles = nasaFootage.attachedTitles;
        if (pixabayTitles.length || nasaTitles.length) {
          const credits = [
            ...(pixabayTitles.length ? ["Pixabay: " + pixabayTitles.join(", ")] : []),
            ...(nasaTitles.length ? ["NASA: " + nasaTitles.join(", ")] : []),
          ];
          footageNote = " Free stock footage added to " + credits.join(" · ") + ". Source credits are embedded; stock clips are muted. Scenes without a strong visual match keep their AI artwork and local animation.";
        } else {
          footageNote = " No sufficiently relevant free stock clips were found or configured for these scenes. Every scene keeps its own AI artwork and local animation.";
        }
      } catch {
        // Free footage libraries are optional; their outages must never block story or video generation.
        footageNote = " Free footage libraries were temporarily unavailable, so scenes keep their generated artwork and local animation.";
      }

      const generatedProject: StudioProject = {
        ...project,
        title: result.story.title,
        topic: project.topic.trim(),
        script: result.story.script,
        scenes,
        editorialNote: result.story.editorialNote,
        voiceAudioDataUrl,
        voiceAudioName,
        storyboardSourceTopic: project.topic.trim(),
        storyboardSourceScript: result.story.script,
        storyboardSourceTargetDuration: project.targetDuration,
        storyboardSourceAspectRatio: project.aspectRatio,
        storyboardSourceLanguage: project.language,
        updatedAt: Date.now(),
      };
      setProject(generatedProject);
      setSelectedSceneId(scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
      setNotice(result.fallbackNotice
        ? result.fallbackNotice + voiceNote + visualNote + footageNote + " Rendering your video…"
        : "Story and scenes are ready." + voiceNote + visualNote + footageNote + " Rendering your video…");
      await renderProject(generatedProject);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Video generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleNewVideo() {
    clearExport();
    const fresh = makeProject("What is happening today?", project.language, project.aspectRatio, project.targetDuration);
    setProject(fresh);
    setTrendContext(undefined);
    setVideoGenre("auto");
    setSelectedSceneId(fresh.scenes[0]?.id ?? "");
    setPlayhead(0);
    setIsPlaying(false);
    setNotice("New video project ready.");
  }

  function handleCancelRender() {
    renderAbortRef.current?.abort();
  }

  return (
    <div className="simple-app-shell">
      <header className="simple-topbar">
        <div className="simple-brand">
          <div className="brand-symbol"><span>?</span><i>▶</i></div>
          <div><strong>SOCHOZARA</strong><small>STUDIO</small></div>
        </div>
        <div className="simple-topbar-actions">
          <span className="save-indicator"><i />{isLoaded ? "Saved on this device" : "Loading…"}</span>
          <button className="button button-quiet" onClick={handleNewVideo} disabled={isGenerating || isRendering}>＋ New video</button>
        </div>
      </header>

      <main className="simple-main">
        <section className="simple-heading">
          <div className="eyebrow">AI VIDEO CREATOR</div>
          <h1>Turn an idea into a video.</h1>
          <p>One idea in. AI-directed scenes, voice-over, centered safe-area subtitles, cinematic transitions and a downloadable 1080p video.</p>
        </section>

        <div className="simple-layout">
          <section className="panel simple-controls">
            <TrendingTopics onChoose={handleTrendChoose} />
            <label className="field-label" htmlFor="simple-topic">WHAT SHOULD THE VIDEO BE ABOUT?</label>
            <textarea
              id="simple-topic"
              className="topic-input"
              rows={3}
              value={project.topic}
              onChange={(event) => { clearExport(); setTrendContext(undefined); setProject((current) => ({ ...current, topic: event.target.value, updatedAt: Date.now() })); }}
              placeholder="Example: How does the stock market work?"
              disabled={isGenerating || isRendering}
            />

            <div className="field-grid simple-settings">
              <div>
                <label className="field-label" htmlFor="simple-language">LANGUAGE</label>
                <select id="simple-language" value={project.language} onChange={(event) => { clearExport(); setProject((current) => ({ ...current, language: event.target.value as Language })); }}>
                  <option>English</option><option>Hinglish</option><option>Hindi</option><option>Telugu</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="simple-format">FORMAT</label>
                <select id="simple-format" value={project.aspectRatio} onChange={(event) => { clearExport(); setProject((current) => ({ ...current, aspectRatio: event.target.value as AspectRatio })); }}>
                  <option value="9:16">Vertical · 9:16</option><option value="16:9">Landscape · 16:9</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="simple-duration">LENGTH</label>
                <select id="simple-duration" value={project.targetDuration} onChange={(event) => { clearExport(); setProject((current) => ({ ...current, targetDuration: Number(event.target.value) })); }}>
                  <option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={300}>5 minutes</option>
                </select>
              </div>
            </div>

            <div className="simple-genre">
              <label className="field-label" htmlFor="simple-genre">VIDEO GENRE</label>
              <select id="simple-genre" value={videoGenre} onChange={(event) => { clearExport(); setVideoGenre(event.target.value as VideoGenre); }}>
                <option value="auto">Auto-detect best style</option>
                <option value="documentary">Documentary</option>
                <option value="explainer">Educational explainer</option>
                <option value="news">Current affairs / news</option>
                <option value="technology">Technology & AI</option>
                <option value="business">Business & startups</option>
                <option value="finance">Finance & markets</option>
                <option value="sports">Sports</option>
                <option value="entertainment">Entertainment & culture</option>
                <option value="history">History</option>
                <option value="science">Science</option>
                <option value="travel">Travel</option>
                <option value="food">Food</option>
                <option value="health">Health & fitness education</option>
                <option value="education">Education</option>
                <option value="mystery">Mystery & investigations</option>
                <option value="biography">Biography</option>
                <option value="nature">Nature & wildlife</option>
                <option value="storytelling">Storytelling</option>
              </select>
            </div>

            <div className="simple-provider">
              <label className="field-label" htmlFor="simple-provider-select">CHOOSE YOUR AI</label>
              <select id="simple-provider-select" value={selectedProvider} onChange={(event) => handleProviderChange(event.target.value)}>
                <option value="cloudflare">Cloudflare Workers AI · Story + FLUX art + English voice</option>
                <option value="gemini">Google Gemini · Story + narration</option>
                <option value="groq">Groq · Story generation</option>
                <option value="openrouter">OpenRouter · Free models · 50 requests/day</option>
              </select>
              {selectedProvider === "cloudflare" ? (
                <div className="simple-security-note">
                  <strong>Daily free AI allowance</strong>
                  <p>Gemma creates the story, FLUX.1 schnell creates distinct scene artwork, and Aura-1 adds English voice-over. All three use the same 10,000-Neuron daily pool, resetting at 00:00 UTC.</p>
                  <p>FLUX artwork, varied camera moves, subtitles and cross-fades are included. When a free Pixabay key is configured, matching stock footage can cover many genres; NASA adds relevant space, Earth and science clips. The app uses no more than three external clips, credits every source and keeps AI artwork motion wherever footage does not fit. No paid text-to-video provider is called.</p>
                </div>
              ) : (
                <>
                  <label className="field-label" htmlFor="simple-api-key">API KEY · SAVED FOR THIS TAB ONLY</label>
                  <input
                    id="simple-api-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={keySaved ? "Key saved · paste a new key to replace" : "Paste your selected provider API key"}
                    disabled={isGenerating || isRendering}
                  />
                  <div className="simple-key-actions">
                    <button className="button button-secondary" onClick={handleSaveKey} disabled={!apiKey.trim() || isGenerating || isRendering}>Save key for this session</button>
                    {keySaved && <button className="text-button" onClick={handleRemoveKey} disabled={isGenerating || isRendering}>Remove key</button>}
                    <span className={providerReady ? "clip-status ready" : "clip-status"}>{providerReady ? "READY" : keySaved ? "FREE-TIER CONFIRMATION REQUIRED" : "KEY REQUIRED"}</span>
                  </div>
                </>
              )}
              {needsFreeAttestation && (
                <label className="simple-free-confirm">
                  <input type="checkbox" checked={freeUseConfirmed} disabled={(!keySaved && selectedProvider !== "cloudflare") || isGenerating || isRendering} onChange={(event) => handleFreeUseChange(event.target.checked)} />
                  <span>{selectedProvider === "cloudflare"
                    ? "I confirm this account is on Cloudflare Workers Free and generation must stop at the 10,000-Neuron daily allowance."
                    : "I confirm this account is on the provider's free tier, has no paid API billing enabled, and must stop when free quota is exhausted."}</span>
                </label>
              )}
              <small className="simple-security-note">Your API key stays in this browser tab's session storage. It is not added to your project, downloaded video, backups or GitHub. Only the selected provider is sent requests. No cross-provider fallback and no paid model IDs.</small>
            </div>

            <button className="button button-primary simple-generate" onClick={() => void handleGenerateVideo()} disabled={!providerReady || !project.topic.trim() || isGenerating || isRendering}>
              {isGenerating ? <><span className="spinner" /> Creating your video…</> : isRendering ? <><span className="spinner" /> Rendering video…</> : "✦ Generate Video"}
            </button>
          </section>

          <section className="panel simple-preview-panel">
            <div className="simple-preview-header">
              <div><span className="field-label">VIDEO PREVIEW</span><h2>{project.title || "Your video"}</h2></div>
              <span className="preview-live"><i /> {isRendering ? "RENDERING" : "READY"}</span>
            </div>
            <PlaybackTimeline
              scenes={project.scenes}
              aspectRatio={project.aspectRatio}
              voiceAudioDataUrl={project.voiceAudioDataUrl}
              selectedSceneId={selectedSceneId}
              playhead={playhead}
              isPlaying={isPlaying}
              onSelectScene={setSelectedSceneId}
              onPlayheadChange={setPlayhead}
              onPlayingChange={setIsPlaying}
              onPlaybackError={setNotice}
            />
            <div className="simple-preview-meta">
              <span>{project.scenes.length} scenes</span><span>{formatTime(duration)}</span><span>{project.aspectRatio}</span>
            </div>
            {isRendering && (
              <div className="render-progress">
                <div className="progress-track"><span style={{ width: (renderProgress * 100) + "%" }} /></div>
                <div className="render-progress-meta">
                  <small>{renderMessage} · {Math.round(renderProgress * 100)}%</small>
                  <button className="text-button cancel-render-button" onClick={handleCancelRender}>Cancel</button>
                </div>
              </div>
            )}
            {exportUrl && !isRendering && (
              <div className="simple-download">
                <div><strong>Your video is ready</strong><small>{exportType.toUpperCase()} · 1080p · 30 FPS · {project.aspectRatio} · {formatTime(duration)}</small></div>
                <a className="button button-download" href={exportUrl} download={safeFileName(project.title) + "." + exportType}>↓ Download {exportType.toUpperCase()}</a>
              </div>
            )}
            {!exportUrl && !isRendering && project.script && (
              <button className="button button-secondary simple-render-again" onClick={() => void renderProject(project)} disabled={isGenerating}>Render & prepare download</button>
            )}
          </section>
        </div>

        <div className="simple-status" role="status" aria-live="polite">{notice}</div>
        {project.editorialNote && <details className="simple-editorial"><summary>Editorial note</summary><p>{project.editorialNote}</p></details>}
        <footer className="simple-footer">SOCHOZARA STUDIO · LOCAL-FIRST VIDEO CREATION</footer>
      </main>
    </div>
  );
}
