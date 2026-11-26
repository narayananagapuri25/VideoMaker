import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { generateStory } from "./lib/ai";
import { makeProject, scenesFromScript } from "./lib/story";
import { loadLatestProject, saveProject } from "./lib/storage";
import { exportMp4 } from "./lib/renderer";
import type { AspectRatio, Language, Scene, StudioProject } from "./types";

const initialProject = () => makeProject("Why do we see lightning before thunder?", "Hinglish", "9:16", 45);

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
}

export default function App() {
  const [project, setProject] = useState<StudioProject>(initialProject);
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [activeSection, setActiveSection] = useState<"studio" | "guide">("studio");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [notice, setNotice] = useState("Your project is stored locally in this browser.");
  const [saveStatus, setSaveStatus] = useState("Loading project…");
  const [generationSource, setGenerationSource] = useState<"local" | "gemini">("local");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const didLoad = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const exportUrlRef = useRef("");

  const selectedScene = useMemo(
    () => project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0],
    [project.scenes, selectedSceneId],
  );
  const totalDuration = project.scenes.reduce((total, scene) => total + Math.max(1, scene.duration), 0);

  useEffect(() => {
    let mounted = true;
    loadLatestProject()
      .then((saved) => {
        if (!mounted) return;
        if (saved) {
          setProject(saved);
          setSelectedSceneId(saved.scenes[0]?.id ?? "");
          setNotice("Restored your latest local project.");
        } else {
          setSelectedSceneId(project.scenes[0]?.id ?? "");
        }
      })
      .catch(() => {
        if (mounted) setNotice("Browser storage is unavailable. Keep a copy of your script before leaving.");
      })
      .finally(() => {
        if (mounted) {
          didLoad.current = true;
          setSaveStatus("Ready");
        }
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!didLoad.current) return;
    setSaveStatus("Saving…");
    const handle = window.setTimeout(() => {
      saveProject(project)
        .then(() => setSaveStatus("Saved on this device"))
        .catch(() => setSaveStatus("Local save unavailable"));
    }, 500);
    return () => window.clearTimeout(handle);
  }, [project]);

  useEffect(() => () => {
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function updateProject(patch: Partial<StudioProject>) {
    setProject((current) => ({ ...current, ...patch, updatedAt: Date.now() }));
  }

  function updateScene(sceneId: string, patch: Partial<Scene>) {
    setProject((current) => ({
      ...current,
      updatedAt: Date.now(),
      scenes: current.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...patch } : scene),
    }));
  }

  async function handleGenerateStory() {
    if (!project.topic.trim()) {
      setNotice("Enter a topic before generating a story.");
      return;
    }
    setIsGenerating(true);
    setNotice(apiKey.trim() ? "Generating a story with Gemini…" : "Creating an offline starter draft…");
    try {
      const result = await generateStory({
        topic: project.topic,
        language: project.language,
        targetDuration: project.targetDuration,
        aspectRatio: project.aspectRatio,
        apiKey,
      });
      const scenes = result.story.scenes.map((scene) => ({
        ...scene,
        id: globalThis.crypto?.randomUUID?.() ?? ("scene-" + Date.now() + "-" + Math.random()),
      }));
      updateProject({ title: result.story.title, script: result.story.script, scenes });
      setSelectedSceneId(scenes[0]?.id ?? "");
      setGenerationSource(result.source);
      setNotice(result.source === "gemini"
        ? "AI story and storyboard created. Verify all factual claims before publishing."
        : "Offline starter created. Add a Gemini API key for AI-generated scripts; this draft is not fact-checked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Story generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  function rebuildScenesFromScript() {
    const scenes = scenesFromScript(project.script, project.targetDuration);
    updateProject({ scenes });
    setSelectedSceneId(scenes[0]?.id ?? "");
    setNotice("Storyboard rebuilt from your current script.");
  }

  async function handleSceneImage(sceneId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose an image file such as JPG, PNG or WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setNotice("For a smoother browser editor, keep scene images under 12 MB.");
      event.target.value = "";
      return;
    }
    try {
      const imageDataUrl = await fileToDataUrl(file);
      updateScene(sceneId, { imageDataUrl });
      setNotice("Scene artwork added. The image remains in this browser project.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Image upload failed.");
    }
    event.target.value = "";
  }

  async function handleAudioUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setNotice("Choose an audio file such as MP3, WAV, M4A or WebM.");
      event.target.value = "";
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setNotice("Keep narration audio under 30 MB for local projects.");
      event.target.value = "";
      return;
    }
    try {
      updateProject({ voiceAudioDataUrl: await fileToDataUrl(file), voiceAudioName: file.name });
      setNotice("Narration audio added and will be included in the MP4 export.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Audio upload failed.");
    }
    event.target.value = "";
  }

  async function startRecording() {
    setRecordingError("");
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setRecordingError("Microphone recording is not available in this browser. Upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setRecordingError("Recording stopped unexpectedly. Please try again.");
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        try {
          updateProject({
            voiceAudioDataUrl: await fileToDataUrl(blob),
            voiceAudioName: "Recorded narration." + (blob.type.includes("ogg") ? "ogg" : "webm"),
          });
          setNotice("Your recorded narration is ready and will be embedded in the MP4.");
        } catch {
          setRecordingError("Could not prepare your recording.");
        }
        setIsRecording(false);
      };
      recorder.start();
      setIsRecording(true);
      setNotice("Recording narration. Select Stop recording when finished.");
    } catch {
      setRecordingError("Microphone permission was denied or unavailable. You can upload a narration file instead.");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  function listenWithDeviceVoice() {
    if (!("speechSynthesis" in window)) {
      setNotice("This browser does not provide speech synthesis. Upload a voice file instead.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(project.script);
    utterance.lang = project.language === "Hindi" || project.language === "Hinglish" ? "hi-IN" : project.language === "Telugu" ? "te-IN" : "en-IN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    setNotice("Playing your device's voice preview. Browser preview audio is not embedded in the exported file.");
  }

  async function handleExport() {
    setIsRendering(true);
    setRenderProgress(0);
    setRenderMessage("Preparing renderer…");
    setNotice("Rendering happens on this device. Keep this tab open until the MP4 is ready.");
    try {
      const blob = await exportMp4(project, ({ progress, message }) => {
        setRenderProgress(progress);
        setRenderMessage(message);
      });
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      const url = URL.createObjectURL(blob);
      exportUrlRef.current = url;
      setExportUrl(url);
      setNotice("MP4 export completed. Preview it, then download when ready.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Video export failed.");
    } finally {
      setIsRendering(false);
    }
  }

  function addScene() {
    const scene: Scene = {
      id: globalThis.crypto?.randomUUID?.() ?? ("scene-" + Date.now()),
      title: "New scene",
      narration: "Write the narration for this scene.",
      caption: "Add a short caption.",
      visualPrompt: "Describe the scene artwork or motion graphic you want.",
      duration: 6,
    };
    updateProject({ scenes: [...project.scenes, scene] });
    setSelectedSceneId(scene.id);
  }

  function moveScene(sceneId: string, direction: -1 | 1) {
    const currentIndex = project.scenes.findIndex((scene) => scene.id === sceneId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= project.scenes.length) return;
    const scenes = [...project.scenes];
    [scenes[currentIndex], scenes[nextIndex]] = [scenes[nextIndex], scenes[currentIndex]];
    updateProject({ scenes });
  }

  function removeScene(sceneId: string) {
    if (project.scenes.length <= 1) {
      setNotice("A video must contain at least one scene.");
      return;
    }
    const scenes = project.scenes.filter((scene) => scene.id !== sceneId);
    updateProject({ scenes });
    setSelectedSceneId(scenes[0].id);
  }

  function newProject() {
    const fresh = makeProject("Enter your next video topic", "Hinglish", "9:16", 45);
    updateProject(fresh);
    setSelectedSceneId(fresh.scenes[0]?.id ?? "");
    setExportUrl("");
    setNotice("New project created.");
  }

  const previewStyle = selectedScene?.imageDataUrl
    ? { backgroundImage: "linear-gradient(180deg,rgba(4,10,19,.18),rgba(4,10,19,.84)),url(" + selectedScene.imageDataUrl + ")" }
    : undefined;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol"><span>?</span><i>▶</i></div>
          <div><strong>SOCHOZARA</strong><small>STUDIO</small></div>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className={"nav-item " + (activeSection === "studio" ? "active" : "")} onClick={() => setActiveSection("studio")}><span>✦</span> Video studio</button>
        <button className={"nav-item " + (activeSection === "guide" ? "active" : "")} onClick={() => setActiveSection("guide")}><span>▤</span> Production guide</button>
        <div className="sidebar-bottom">
          <div className="privacy-card"><span className="privacy-dot" /><strong>Local-first workspace</strong><p>Your scripts, images and recordings stay in this browser unless you send a prompt to an AI provider.</p></div>
          <div className="sidebar-version">VERSION 0.1 · EARLY BUILD</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-symbol small"><span>?</span><i>▶</i></div><strong>SOCHOZARA STUDIO</strong></div>
          <div className="topbar-right"><span className="save-indicator"><i />{saveStatus}</span><button className="button button-quiet" onClick={newProject}>＋ New project</button></div>
        </header>

        {activeSection === "guide" ? (
          <section className="guide-page">
            <div className="eyebrow">HOW THE STUDIO WORKS</div>
            <h1>From one idea to a finished video.</h1>
            <p className="page-intro">The editor, motion graphics and MP4 renderer run on your device. AI generation is optional and uses your own provider key.</p>
            <div className="guide-grid">
              <article className="guide-card"><span>01</span><h3>Write the story</h3><p>Enter a topic. Use the offline story starter or connect a Gemini API key for AI-written scripts and storyboards.</p></article>
              <article className="guide-card"><span>02</span><h3>Build your scenes</h3><p>Edit captions, narration and prompts. Add your own AI-created or properly licensed images to each scene.</p></article>
              <article className="guide-card"><span>03</span><h3>Add narration</h3><p>Upload a commercially usable AI voice file or record narration. The built-in device voice is only a preview and is not exported.</p></article>
              <article className="guide-card"><span>04</span><h3>Export your MP4</h3><p>Render an H.264 MP4 locally using browser media capabilities. Compatibility depends on the device and browser encoders.</p></article>
            </div>
            <div className="notice notice-warn"><strong>Free-tier and rights reminder</strong><p>AI provider quotas can change. A free API tier may use submitted prompts to improve the provider's products. Never send sensitive information. Check the licence of every generated or imported asset before monetised publication.</p></div>
            <button className="button button-primary" onClick={() => setActiveSection("studio")}>Open video studio →</button>
          </section>
        ) : (
          <div className="studio-page">
            <section className="page-heading">
              <div><div className="eyebrow">YOUR CREATOR WORKSPACE</div><h1>Make something worth watching.</h1><p>Plan, build and export original videos without a paid rendering service.</p></div>
              <div className="project-chip"><span className="live-dot" /> LOCAL PROJECT <strong>{formatTime(totalDuration)}</strong></div>
            </section>

            <div className="studio-grid">
              <section className="left-column">
                <article className="panel project-panel">
                  <div className="panel-heading"><div><span className="step-number">01</span><div><h2>Start with an idea</h2><p>Set the topic and video format.</p></div></div><span className="panel-icon">✧</span></div>
                  <label className="field-label" htmlFor="topic">VIDEO TOPIC</label>
                  <textarea id="topic" className="topic-input" rows={2} value={project.topic} onChange={(event) => updateProject({ topic: event.target.value })} placeholder="e.g. Why do we see lightning before thunder?" />
                  <div className="field-grid">
                    <div><label className="field-label" htmlFor="language">LANGUAGE</label><select id="language" value={project.language} onChange={(event) => updateProject({ language: event.target.value as Language })}><option>Hinglish</option><option>Hindi</option><option>English</option><option>Telugu</option></select></div>
                    <div><label className="field-label" htmlFor="ratio">FORMAT</label><select id="ratio" value={project.aspectRatio} onChange={(event) => updateProject({ aspectRatio: event.target.value as AspectRatio })}><option value="9:16">Vertical · 9:16</option><option value="16:9">Landscape · 16:9</option></select></div>
                    <div><label className="field-label" htmlFor="duration">TARGET LENGTH</label><select id="duration" value={project.targetDuration} onChange={(event) => updateProject({ targetDuration: Number(event.target.value) })}><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={300}>5 minutes</option><option value={480}>8 minutes</option></select></div>
                  </div>
                  <div className="ai-key-box">
                    <div className="key-title"><span>✦</span><strong>Optional Gemini AI connection</strong><em>FREE TIER</em></div>
                    <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your Google AI Studio API key" autoComplete="off" />
                    <small>Key stays in memory only and is not saved to your project. Free-tier limits apply. Google's free tier may use prompts to improve products; never send private information. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a key ↗</a></small>
                  </div>
                  <div className="button-row">
                    <button className="button button-primary" disabled={isGenerating} onClick={handleGenerateStory}>{isGenerating ? <><span className="spinner" /> Creating…</> : "✦ Generate story & scenes"}</button>
                    <span className="microcopy">{apiKey.trim() ? "Gemini AI" : "Offline starter · no key needed"}</span>
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-heading"><div><span className="step-number">02</span><div><h2>Shape the script</h2><p>Edit the narration before making scenes.</p></div></div><span className="panel-icon">Aa</span></div>
                  <textarea className="script-input" value={project.script} onChange={(event) => updateProject({ script: event.target.value })} rows={8} placeholder="Your narration appears here…" />
                  <div className="script-footer"><span>{project.script.trim().split(/\s+/).filter(Boolean).length} words · {generationSource === "gemini" ? "AI-generated draft" : "Local starter draft"}</span><button className="text-button" onClick={rebuildScenesFromScript}>↻ Rebuild storyboard from script</button></div>
                </article>

                <article className="panel">
                  <div className="panel-heading"><div><span className="step-number">03</span><div><h2>Narration track</h2><p>Add audio that will be embedded in the MP4.</p></div></div><span className="panel-icon">◖))</span></div>
                  {project.voiceAudioDataUrl ? (
                    <div className="audio-ready"><div className="audio-file-icon">♫</div><div className="audio-meta"><strong>{project.voiceAudioName || "Narration audio"}</strong><small>Ready for MP4 export</small></div><button className="icon-button" title="Remove narration" onClick={() => updateProject({ voiceAudioDataUrl: undefined, voiceAudioName: undefined })}>×</button><audio controls src={project.voiceAudioDataUrl} /></div>
                  ) : (
                    <div className="audio-empty"><div className="audio-wave">▂ ▅ ▃ ▆ ▄ ▇</div><strong>No narration audio yet</strong><p>Upload a licensed AI voice track or record your narration. Browser voice preview is not included in the exported video.</p></div>
                  )}
                  <div className="button-row audio-actions">
                    <label className="button button-secondary file-button">↑ Upload audio<input type="file" accept="audio/*" onChange={handleAudioUpload} /></label>
                    {isRecording
                      ? <button className="button button-danger" onClick={stopRecording}>■ Stop recording</button>
                      : <button className="button button-secondary" onClick={startRecording}>● Record voice</button>}
                    <button className="button button-quiet" onClick={listenWithDeviceVoice}>▶ Voice preview</button>
                  </div>
                  {recordingError && <p className="error-text">{recordingError}</p>}
                </article>
              </section>

              <section className="right-column">
                <article className="panel preview-panel">
                  <div className="panel-heading preview-heading"><div><span className="step-number">PREVIEW</span><div><h2>Video canvas</h2><p>{project.aspectRatio} · {project.scenes.length} scenes · {formatTime(totalDuration)}</p></div></div><span className="preview-live"><i /> LIVE</span></div>
                  <div className={"preview-stage " + (project.aspectRatio === "16:9" ? "landscape" : "")}>
                    <div className="preview-image-layer" style={previewStyle} />
                    <div className="preview-shade" />
                    <div className="preview-brand"><span className="preview-mark">?</span><strong>SOCHOZARA</strong><small>DUNIYA KE FACTS. EK NAYA ANGLE.</small></div>
                    <div className="preview-content">
                      <small>CHAPTER {String(Math.max(0, project.scenes.findIndex((scene) => scene.id === selectedScene?.id) + 1)).padStart(2, "0")}</small>
                      <h3>{selectedScene?.title || "Your next scene"}</h3>
                      <p>{selectedScene?.caption || "Your scene caption appears here."}</p>
                    </div>
                    <div className="preview-progress"><span style={{ width: "47%" }} /></div>
                    <div className="preview-watermark">MOTION PREVIEW</div>
                  </div>
                  <div className="preview-caption"><span className="sound-icon">◖))</span><span>{selectedScene?.narration || "Scene narration preview"}</span></div>
                  <div className="export-controls">
                    <button className="button button-primary export-button" onClick={handleExport} disabled={isRendering || !project.scenes.length}>{isRendering ? <><span className="spinner" /> Rendering MP4…</> : "↓ Export finished MP4"}</button>
                    <span className="export-spec">{project.aspectRatio === "9:16" ? "720 × 1280" : "1280 × 720"} · H.264</span>
                  </div>
                  {isRendering && <div className="render-progress"><div className="progress-track"><span style={{ width: (renderProgress * 100) + "%" }} /></div><small>{renderMessage} · {Math.round(renderProgress * 100)}%</small></div>}
                  {exportUrl && !isRendering && <div className="download-ready"><span>✓ MP4 ready</span><a className="button button-download" href={exportUrl} download={(project.title || "sochozara-video").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".mp4"}>Download MP4 ↓</a></div>}
                </article>

                <article className="panel scene-panel">
                  <div className="panel-heading"><div><span className="step-number">04</span><div><h2>Storyboard</h2><p>Select a scene to edit its visuals and captions.</p></div></div><button className="add-scene" onClick={addScene}>＋ Add</button></div>
                  <div className="scene-list">
                    {project.scenes.map((scene, index) => (
                      <button key={scene.id} className={"scene-row " + (scene.id === selectedScene?.id ? "selected" : "")} onClick={() => setSelectedSceneId(scene.id)}>
                        <span className="scene-number">{String(index + 1).padStart(2, "0")}</span>
                        <span className="scene-row-main"><strong>{scene.title || "Untitled scene"}</strong><small>{scene.caption.slice(0, 74) || "No caption yet"}</small></span>
                        <span className="scene-time">{formatTime(scene.duration)}</span>
                      </button>
                    ))}
                  </div>
                  {selectedScene && (
                    <div className="scene-editor">
                      <div className="scene-editor-top"><strong>SCENE DETAILS</strong><div><button className="tiny-action" onClick={() => moveScene(selectedScene.id, -1)} title="Move up">↑</button><button className="tiny-action" onClick={() => moveScene(selectedScene.id, 1)} title="Move down">↓</button><button className="tiny-action danger-text" onClick={() => removeScene(selectedScene.id)} title="Delete scene">×</button></div></div>
                      <label className="field-label">SCENE TITLE</label>
                      <input value={selectedScene.title} onChange={(event) => updateScene(selectedScene.id, { title: event.target.value })} />
                      <label className="field-label">ON-SCREEN CAPTION</label>
                      <textarea rows={2} value={selectedScene.caption} onChange={(event) => updateScene(selectedScene.id, { caption: event.target.value })} />
                      <label className="field-label">NARRATION TEXT</label>
                      <textarea rows={3} value={selectedScene.narration} onChange={(event) => updateScene(selectedScene.id, { narration: event.target.value })} />
                      <label className="field-label">VISUAL PROMPT / ART DIRECTION</label>
                      <textarea rows={2} value={selectedScene.visualPrompt} onChange={(event) => updateScene(selectedScene.id, { visualPrompt: event.target.value })} />
                      <div className="scene-editor-bottom">
                        <div><label className="field-label">DURATION (SECONDS)</label><input type="number" min="1" max="90" value={selectedScene.duration} onChange={(event) => updateScene(selectedScene.id, { duration: Math.max(1, Math.min(90, Number(event.target.value) || 1)) })} /></div>
                        <label className="button button-secondary file-button">{selectedScene.imageDataUrl ? "↻ Replace artwork" : "＋ Add artwork"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleSceneImage(selectedScene.id, event)} /></label>
                      </div>
                      {selectedScene.imageDataUrl && <button className="text-button remove-artwork" onClick={() => updateScene(selectedScene.id, { imageDataUrl: undefined })}>Remove scene artwork</button>}
                    </div>
                  )}
                </article>
              </section>
            </div>
            <div className="status-line"><span className="status-pulse" />{notice}</div>
            <footer className="app-footer"><span>SOCHOZARA STUDIO · BUILT FOR ORIGINAL STORIES</span><span>Local-first · No paid rendering API · No automatic uploads</span></footer>
          </div>
        )}
      </main>
    </div>
  );
}