import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { generateStory } from "./lib/ai";
import { deriveTopicFromScript, makeProject, parsePastedNarration, scenesFromScript } from "./lib/story";
import { loadLatestProject, saveProject } from "./lib/storage";
import { generateNarration } from "./lib/tts";
import { buildSceneImagePrompt } from "./lib/art-prompt";
import { getSceneStartTime, getTimelineDuration } from "./lib/timeline";
import PlaybackTimeline from "./components/PlaybackTimeline";
import CreatorKit from "./components/CreatorKit";
import type { AspectRatio, Language, Scene, StudioProject } from "./types";
import { getEmbeddedAudioSize, getEmbeddedImageSize, isSupportedImageMimeType, MAX_NARRATION_AUDIO_BYTES, MAX_SCENE_IMAGE_BYTES } from "./lib/media-data";

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
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visualProvider, setVisualProvider] = useState<"adobe-firefly" | "pexels" | "other">("adobe-firefly");
  const [apiKey, setApiKey] = useState("");
  const [activeSection, setActiveSection] = useState<"studio" | "guide">("studio");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [notice, setNotice] = useState("Your project is stored locally in this browser.");
  const [saveStatus, setSaveStatus] = useState("Loading project…");
  const [generationSource, setGenerationSource] = useState<"local" | "gemini" | "provided-script">("local");
  const [isRecording, setIsRecording] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [ttsVoice, setTtsVoice] = useState("Kore");
  const [recordingError, setRecordingError] = useState("");
  const didLoad = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const exportUrlRef = useRef("");
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const selectedScene = useMemo(
    () => project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0],
    [project.scenes, selectedSceneId],
  );
  const totalDuration = getTimelineDuration(project.scenes);
  const pastedNarration = useMemo(() => parsePastedNarration(project.topic), [project.topic]);
  const storyboardInSync =
    project.storyboardSourceTopic === project.topic &&
    project.storyboardSourceScript === project.script &&
    project.storyboardSourceTargetDuration === project.targetDuration &&
    project.storyboardSourceAspectRatio === project.aspectRatio;
  const handlePlaybackError = useCallback((message: string) => setNotice(message), []);

  useEffect(() => {
    let mounted = true;
    loadLatestProject()
      .then((saved) => {
        if (!mounted) return;
        if (saved) {
          // Repair older projects where a full narration was pasted into the topic field
          // and a previous offline starter was appended to its script.
          const pasted = parsePastedNarration(saved.topic);
          const topic = pasted ? deriveTopicFromScript(pasted.script) : saved.topic;
          const restoredScript = pasted ? pasted.script : saved.script;
          const restoredScenes = pasted
            ? scenesFromScript(restoredScript, saved.targetDuration, topic)
            : saved.scenes;
          const restored: StudioProject = {
            ...saved,
            title: pasted ? topic : saved.title,
            topic,
            script: restoredScript,
            scenes: restoredScenes,
            storyboardSourceTopic: topic,
            storyboardSourceScript: restoredScript,
            storyboardSourceTargetDuration: saved.targetDuration,
            storyboardSourceAspectRatio: saved.aspectRatio,
            editorialNote: pasted ? pasted.editorialNote : saved.editorialNote,
          };
          setProject(restored);
          setSelectedSceneId(restored.scenes[0]?.id ?? "");
          if (pasted) setGenerationSource("provided-script");
          setNotice(pasted
            ? "Recovered your pasted narration, removed the unrelated filler, and rebuilt matching scenes."
            : "Restored your latest local project.");
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

  function invalidateExport() {
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    exportUrlRef.current = "";
    setExportUrl("");
  }

  function updateProject(patch: Partial<StudioProject>) {
    if (["topic", "script", "scenes", "targetDuration", "aspectRatio", "voiceAudioDataUrl"].some((key) => key in patch)) {
      invalidateExport();
    }
    setProject((current) => ({ ...current, ...patch, updatedAt: Date.now() }));
  }

  function updateScene(sceneId: string, patch: Partial<Scene>) {
    invalidateExport();
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
    if (pastedNarration) {
      const topic = deriveTopicFromScript(pastedNarration.script);
      const scenes = scenesFromScript(pastedNarration.script, project.targetDuration, topic);
      updateProject({
        title: topic,
        topic,
        script: pastedNarration.script,
        scenes,
        editorialNote: pastedNarration.editorialNote,
        storyboardSourceTopic: topic,
        storyboardSourceScript: pastedNarration.script,
        storyboardSourceTargetDuration: project.targetDuration,
        storyboardSourceAspectRatio: project.aspectRatio,
      });
      setSelectedSceneId(scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
      setGenerationSource("provided-script");
      setNotice("Pasted narration detected and preserved. Matching scenes were created from your actual lines; no generic filler was added. The scientific note stays outside the spoken script.");
      return;
    }
    setIsGenerating(true);
    setNotice(apiKey.trim() ? "Generating a story with Gemini…" : "Creating a topic-specific offline starter draft…");
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
      updateProject({
        title: result.story.title,
        script: result.story.script,
        scenes,
        editorialNote: result.story.editorialNote,
        storyboardSourceTopic: project.topic,
        storyboardSourceScript: result.story.script,
        storyboardSourceTargetDuration: project.targetDuration,
        storyboardSourceAspectRatio: project.aspectRatio,
      });
      setSelectedSceneId(scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
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
    if (!project.script.trim()) {
      setNotice("Add narration before rebuilding the storyboard.");
      return;
    }
    const scenes = scenesFromScript(project.script, project.targetDuration, project.topic);
    updateProject({
      scenes,
      storyboardSourceTopic: project.topic,
      storyboardSourceScript: project.script,
      storyboardSourceTargetDuration: project.targetDuration,
      storyboardSourceAspectRatio: project.aspectRatio,
    });
    setSelectedSceneId(scenes[0]?.id ?? "");
    setPlayhead(0);
    setIsPlaying(false);
    setNotice("Storyboard rebuilt from your current script.");
  }

  async function handleSceneImage(sceneId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isSupportedImageMimeType(file.type)) {
      setNotice("Choose a PNG, JPEG, WebP, GIF, AVIF or BMP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_SCENE_IMAGE_BYTES) {
      setNotice("For a smoother browser editor, keep scene images under 12 MB.");
      event.target.value = "";
      return;
    }
    try {
      const imageDataUrl = await fileToDataUrl(file);
      updateScene(sceneId, { imageDataUrl, imageProvider: visualProvider, imageCommercialUseConfirmed: false, imageSourceNote: visualProvider === "adobe-firefly" ? "Adobe Firefly · confirm selected Adobe model and non-beta feature" : visualProvider === "pexels" ? "Pexels · record asset URL/creator and verify licence" : "Other source · record model/provider and licence" });
      setNotice("Scene artwork added. Review its commercial-use terms and confirm the asset rights in the scene editor.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Image upload failed.");
    }
    event.target.value = "";
  }

  async function copyNarrationForFreeTts() {
    if (!project.script.trim()) {
      setNotice("Add narration text before copying it to the free voice generator.");
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(project.script);
      setNotice("Narration copied. Open TTSMaker, paste the text, choose a voice, preview and download the MP3, then upload it here.");
    } catch {
      setNotice("Could not copy automatically. Select the narration in the script editor and copy it manually, then open TTSMaker.");
    }
  }

  async function handleGenerateAiVoice() {
    if (!apiKey.trim()) {
      setNotice("Enter your Gemini API key in the connection field above before generating AI narration.");
      return;
    }
    if (!project.script.trim()) {
      setNotice("Add narration text before generating AI voice.");
      return;
    }
    setIsGeneratingVoice(true);
    setNotice("Generating narration with Gemini 3.8 Flash TTS free-tier model…");
    try {
      const audio = await generateNarration(project.script, apiKey, ttsVoice, project.language);
      const audioDataUrl = await fileToDataUrl(audio);
      updateProject({ voiceAudioDataUrl: audioDataUrl, voiceAudioName: "Gemini TTS · " + ttsVoice + ".wav" });
      setNotice("AI narration generated. Preview it and check pronunciation before exporting.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI narration generation failed.");
    } finally {
      setIsGeneratingVoice(false);
    }
  }

  async function handleAudioUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setNotice("Choose an audio file such as MP3, WAV, M4A or WebM.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_NARRATION_AUDIO_BYTES) {
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
    if (!storyboardInSync) {
      setNotice("Export paused: your topic, narration, format or target length changed after the storyboard was created. Generate again or rebuild the storyboard first.");
      return;
    }
    const unverified = project.scenes.filter((scene) => scene.imageDataUrl && !scene.imageCommercialUseConfirmed);
    if (unverified.length) {
      setNotice("Before export, review and confirm commercial-use rights for artwork in: " + unverified.map((scene) => scene.title).join(", ") + ".");
      return;
    }
    setIsPlaying(false);
    setIsRendering(true);
    setRenderProgress(0);
    setRenderMessage("Preparing renderer…");
    setNotice("Rendering happens on this device. Keep this tab open until the MP4 is ready.");
    try {
      const { exportMp4 } = await import("./lib/renderer");
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
    setPlayhead(totalDuration);
    setIsPlaying(false);
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
    setPlayhead(Math.min(playhead, getTimelineDuration(scenes)));
    setIsPlaying(false);
  }

  function exportProjectBackup() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (project.title || "sochozara-project").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".sochozara.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Project backup downloaded, including any imported scene artwork and narration audio.");
  }

  async function importProjectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      setNotice("Project backup is larger than 80 MB. Reduce media sizes and try again.");
      event.target.value = "";
      return;
    }
    try {
      const imported = JSON.parse(await file.text()) as Partial<StudioProject>;
      if (!imported.title || !imported.topic || !Array.isArray(imported.scenes) || imported.scenes.length === 0) {
        throw new Error("This file is not a valid SochoZara project backup.");
      }
      if (imported.scenes.length > 80) {
        throw new Error("This backup contains too many scenes. Split it into smaller projects and try again.");
      }
      const scenes = imported.scenes.map((scene, index) => {
        if (!scene || typeof scene !== "object") {
          throw new Error("This backup contains an invalid scene.");
        }
        let imageDataUrl: string | undefined;
        if (scene.imageDataUrl) {
          const imageSize = getEmbeddedImageSize(scene.imageDataUrl);
          if (imageSize === null || imageSize > MAX_SCENE_IMAGE_BYTES) {
            throw new Error("This backup contains an unsupported, external or oversized scene image. Use an embedded PNG, JPEG, WebP, GIF, AVIF or BMP image under 12 MB.");
          }
          imageDataUrl = scene.imageDataUrl;
        }
        return {
          id: String(scene.id || ("imported-scene-" + index + "-" + Date.now())),
          title: String(scene.title || "Scene " + (index + 1)),
          narration: String(scene.narration || ""),
          caption: String(scene.caption || ""),
          visualPrompt: String(scene.visualPrompt || ""),
          duration: Math.max(1, Math.min(90, Number(scene.duration) || 5)),
          imageDataUrl,
          imageProvider: scene.imageProvider === "adobe-firefly" || scene.imageProvider === "pexels" || scene.imageProvider === "other" ? scene.imageProvider : undefined,
          imageSourceNote: typeof scene.imageSourceNote === "string" ? scene.imageSourceNote : undefined,
          imageCommercialUseConfirmed: Boolean(scene.imageCommercialUseConfirmed),
        };
      });
      let voiceAudioDataUrl: string | undefined;
      if (imported.voiceAudioDataUrl) {
        const audioSize = getEmbeddedAudioSize(imported.voiceAudioDataUrl);
        if (audioSize === null || audioSize > MAX_NARRATION_AUDIO_BYTES) {
          throw new Error("This backup contains an unsupported, external or oversized narration file. Use an embedded audio file under 30 MB.");
        }
        voiceAudioDataUrl = imported.voiceAudioDataUrl;
      }
      const restored: StudioProject = {
        id: String(imported.id || Date.now()),
        title: String(imported.title),
        topic: String(imported.topic),
        language: ["Hinglish", "Hindi", "English", "Telugu"].includes(String(imported.language)) ? imported.language as Language : "Hinglish",
        aspectRatio: imported.aspectRatio === "16:9" ? "16:9" : "9:16",
        targetDuration: Math.max(10, Number(imported.targetDuration) || 45),
        script: String(imported.script || ""),
        scenes,
        storyboardSourceTopic: typeof imported.storyboardSourceTopic === "string" ? imported.storyboardSourceTopic : String(imported.topic),
        storyboardSourceScript: typeof imported.storyboardSourceScript === "string" ? imported.storyboardSourceScript : String(imported.script || ""),
        storyboardSourceTargetDuration: typeof imported.storyboardSourceTargetDuration === "number" ? imported.storyboardSourceTargetDuration : Math.max(10, Number(imported.targetDuration) || 45),
        storyboardSourceAspectRatio: imported.storyboardSourceAspectRatio === "16:9" ? "16:9" : "9:16",
        editorialNote: typeof imported.editorialNote === "string" ? imported.editorialNote : undefined,
        voiceAudioDataUrl,
        voiceAudioName: typeof imported.voiceAudioName === "string" ? imported.voiceAudioName : undefined,
        updatedAt: Date.now(),
      };
      const pasted = parsePastedNarration(restored.topic);
      if (pasted) {
        const topic = deriveTopicFromScript(pasted.script);
        const recoveredScenes = scenesFromScript(pasted.script, restored.targetDuration, topic);
        restored.title = topic;
        restored.topic = topic;
        restored.script = pasted.script;
        restored.scenes = recoveredScenes;
        restored.storyboardSourceTopic = topic;
        restored.storyboardSourceScript = pasted.script;
        restored.storyboardSourceTargetDuration = restored.targetDuration;
        restored.storyboardSourceAspectRatio = restored.aspectRatio;
        restored.editorialNote = pasted.editorialNote;
        setGenerationSource("provided-script");
      }
      updateProject(restored);
      setSelectedSceneId(restored.scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
      setExportUrl("");
      setNotice("Project backup imported. Check the media and audio before exporting.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not import this project backup.");
    }
    event.target.value = "";
  }

  function newProject() {
    const fresh = makeProject("Enter your next video topic", "Hinglish", "9:16", 45);
    updateProject(fresh);
    setSelectedSceneId(fresh.scenes[0]?.id ?? "");
    setPlayhead(0);
    setIsPlaying(false);
    setExportUrl("");
    setGenerationSource("local");
    setNotice("New project created.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol"><span>?</span><i>▶</i></div>
          <div><strong>SOCHOZARA</strong><small>STUDIO</small></div>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className={"nav-item " + (activeSection === "studio" ? "active" : "")} onClick={() => setActiveSection("studio")}><span>✦</span> Video studio</button>
        <button className={"nav-item " + (activeSection === "guide" ? "active" : "")} onClick={() => setActiveSection("guide")}><span>▤</span> Channel launch kit</button>
        <div className="sidebar-bottom">
          <div className="privacy-card"><span className="privacy-dot" /><strong>Local-first workspace</strong><p>Your scripts, images and recordings stay in this browser unless you send a prompt to an AI provider.</p></div>
          <div className="sidebar-version">VERSION 0.1 · EARLY BUILD</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-symbol small"><span>?</span><i>▶</i></div><strong>SOCHOZARA STUDIO</strong></div>
          <div className="topbar-right"><span className="save-indicator"><i />{saveStatus}</span><button className="button button-quiet backup-button" onClick={exportProjectBackup}>↓ Backup</button><label className="button button-quiet file-button backup-button">↑ Import<input ref={backupInputRef} type="file" accept=".json,.sochozara.json,application/json" onChange={importProjectBackup} /></label><button className="button button-quiet" onClick={newProject}>＋ New project</button></div>
        </header>

        {activeSection === "guide" ? (
          <CreatorKit onUseTopic={(topic) => {
            const next = makeProject(topic, project.language, project.aspectRatio, project.targetDuration);
            setProject(next);
            setSelectedSceneId(next.scenes[0]?.id ?? "");
            setPlayhead(0);
            setIsPlaying(false);
            if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
            exportUrlRef.current = "";
            setExportUrl("");
            setActiveSection("studio");
            setNotice("A fresh starter storyboard is ready for this topic. Edit it or generate an AI version.");
          }} />
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
                  <label className="field-label" htmlFor="topic">VIDEO TOPIC OR PASTED NARRATION</label>
                  <textarea id="topic" className="topic-input" rows={2} value={project.topic} onChange={(event) => updateProject({ topic: event.target.value })} placeholder="Enter a short topic, or paste your complete narration here…" />
                  {pastedNarration && (
                    <div className="topic-detected" role="status">
                      <strong>Full narration detected · {pastedNarration.script.trim().split(/\s+/).filter(Boolean).length} words</strong>
                      <span>Generate will move this text into the script, separate the scientific note and build scenes from the actual narration.</span>
                    </div>
                  )}
                  <div className="field-grid">
                    <div><label className="field-label" htmlFor="language">LANGUAGE</label><select id="language" value={project.language} onChange={(event) => updateProject({ language: event.target.value as Language })}><option>Hinglish</option><option>Hindi</option><option>English</option><option>Telugu</option></select></div>
                    <div><label className="field-label" htmlFor="ratio">FORMAT</label><select id="ratio" value={project.aspectRatio} onChange={(event) => updateProject({ aspectRatio: event.target.value as AspectRatio })}><option value="9:16">Vertical · 9:16</option><option value="16:9">Landscape · 16:9</option></select></div>
                    <div><label className="field-label" htmlFor="duration">TARGET LENGTH</label><select id="duration" value={project.targetDuration} onChange={(event) => updateProject({ targetDuration: Number(event.target.value) })}><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={300}>5 minutes</option><option value={480}>8 minutes</option></select></div>
                  </div>
                  <div className="ai-key-box">
                    <div className="key-title"><span>✦</span><strong>Optional Gemini AI connection</strong><em>FREE TIER</em></div>
                    <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your Google AI Studio API key" autoComplete="off" />
                    <small>Key stays in memory only and is not saved to your project. Use a key with billing disabled. The app selects only this free-tier model, but cannot inspect your Google billing settings. Free-tier prompts may be used to improve Google products; never send private information. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a key ↗</a></small>
                  </div>
                  <div className="button-row">
                    <button className="button button-primary" disabled={isGenerating} onClick={handleGenerateStory}>{isGenerating ? <><span className="spinner" /> Creating…</> : "✦ Generate story & scenes"}</button>
                    <span className="microcopy">{apiKey.trim() ? "Gemini AI" : "Offline starter · no key needed"}</span>
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-heading"><div><span className="step-number">02</span><div><h2>Shape the script</h2><p>Edit the narration before making scenes.</p></div></div><span className="panel-icon">Aa</span></div>
                  <textarea className="script-input" value={project.script} onChange={(event) => updateProject({ script: event.target.value })} rows={8} placeholder="Your narration appears here…" />
                  <div className="script-footer"><span>{project.script.trim().split(/\s+/).filter(Boolean).length} words · {generationSource === "gemini" ? "AI-generated draft" : generationSource === "provided-script" ? "Your supplied narration" : "Local starter draft"}</span><button className="text-button" onClick={rebuildScenesFromScript}>↻ Rebuild storyboard from script</button></div>
                  {!storyboardInSync && (
                    <div className="sync-warning" role="status">
                      <strong>Storyboard is out of sync</strong>
                      <span>Your topic, narration, format or target duration changed. Rebuild from the script or generate again before exporting.</span>
                    </div>
                  )}
                  {project.editorialNote && (
                    <div className="editorial-note">
                      <strong>Scientific / editorial note · not spoken</strong>
                      <p>{project.editorialNote}</p>
                    </div>
                  )}
                </article>

                <article className="panel">
                  <div className="panel-heading"><div><span className="step-number">03</span><div><h2>Narration track</h2><p>Generate or import audio that will be embedded in the MP4.</p></div></div><span className="panel-icon">◖))</span></div>
                  {project.voiceAudioDataUrl ? (
                    <div className="audio-ready"><div className="audio-file-icon">♫</div><div className="audio-meta"><strong>{project.voiceAudioName || "Narration audio"}</strong><small>Ready for MP4 export</small></div><button className="icon-button" title="Remove narration" onClick={() => updateProject({ voiceAudioDataUrl: undefined, voiceAudioName: undefined })}>×</button><audio controls src={project.voiceAudioDataUrl} /><a className="audio-download" href={project.voiceAudioDataUrl} download={project.voiceAudioName || "sochozara-narration"}>↓ Download narration audio</a></div>
                  ) : (
                    <div className="audio-empty"><div className="audio-wave">▂ ▅ ▃ ▆ ▄ ▇</div><strong>No narration audio yet</strong><p>Use the free voice workflow below, upload an audio file, or record your narration. Device voice preview is not embedded in the exported video.</p></div>
                  )}
                  <div className="free-tts-card">
                    <div className="free-tts-title"><strong>Free AI voice · TTSMaker</strong><span>NO API KEY</span></div>
                    <p>Copy your script, open TTSMaker, choose a Hindi or multilingual voice, adjust speed, preview it and download the MP3. Then return here and upload the MP3 below.</p>
                    <div className="free-tts-actions">
                      <button className="button button-secondary" disabled={!project.script.trim()} onClick={copyNarrationForFreeTts}>▣ Copy narration</button>
                      <a className="button button-primary" href="https://ttsmaker.app/" target="_blank" rel="noopener noreferrer">Open free TTSMaker ↗</a>
                    </div>
                    <small className="tts-disclaimer">TTSMaker is an external service. Your script is sent to it when you paste it there. It does not offer a public API, so voice generation and MP3 download happen on its website; do not submit private text.</small>
                  </div>
                  <div className="tts-controls">
                    <div><label className="field-label">GEMINI AI VOICE</label><select value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)}><option value="Kore">Kore · warm</option><option value="Aoede">Aoede · expressive</option><option value="Puck">Puck · energetic</option><option value="Charon">Charon · deep</option><option value="Fenrir">Fenrir · bold</option><option value="Zephyr">Zephyr · bright</option></select></div>
                    <button className="button button-primary tts-button" disabled={isGeneratingVoice || !apiKey.trim()} onClick={handleGenerateAiVoice}>{isGeneratingVoice ? <><span className="spinner" /> Generating voice…</> : "✦ Generate with Gemini"}</button>
                  </div>
                  <small className="tts-disclaimer">Optional Gemini API route: use a key with billing disabled, check current free-tier access and quotas first, and avoid private text. This provider is separate from TTSMaker.</small>
                  <div className="button-row audio-actions">
                    <label className="button button-secondary file-button">↑ Upload MP3 / audio<input type="file" accept="audio/*" onChange={handleAudioUpload} /></label>
                    {isRecording
                      ? <button className="button button-danger" onClick={stopRecording}>■ Stop recording</button>
                      : <button className="button button-secondary" onClick={startRecording}>● Record voice</button>}
                    <button className="button button-quiet" onClick={listenWithDeviceVoice}>▶ Device voice preview</button>
                  </div>
                  {recordingError && <p className="error-text">{recordingError}</p>}
                </article>
              </section>

              <section className="right-column">
                <article className="panel preview-panel">
                  <div className="panel-heading preview-heading"><div><span className="step-number">PREVIEW</span><div><h2>Video canvas</h2><p>{project.aspectRatio} · {project.scenes.length} scenes · {formatTime(totalDuration)}</p></div></div><span className="preview-live"><i /> LIVE</span></div>
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
                    onPlaybackError={handlePlaybackError}
                  />
                  <div className="preview-caption"><span className="sound-icon">◖))</span><span>{selectedScene?.caption || selectedScene?.narration || "Scene narration preview"}</span></div>
                  <div className="export-controls">
                    <button className="button button-primary export-button" onClick={handleExport} disabled={isRendering || !project.scenes.length || !storyboardInSync}>{isRendering ? <><span className="spinner" /> Rendering MP4…</> : "↓ Export finished MP4"}</button>
                    <span className="export-spec">{project.aspectRatio === "9:16" ? "720 × 1280" : "1280 × 720"} · H.264</span>
                    {!storyboardInSync && <small className="export-blocked-note">Rebuild the storyboard before exporting.</small>}
                    {!project.voiceAudioDataUrl && <small className="export-blocked-note">No narration audio added — this MP4 will be silent. Device voice preview is not embedded.</small>}
                  </div>
                  {isRendering && <div className="render-progress"><div className="progress-track"><span style={{ width: (renderProgress * 100) + "%" }} /></div><small>{renderMessage} · {Math.round(renderProgress * 100)}%</small></div>}
                  {exportUrl && !isRendering && <div className="download-ready"><span>✓ MP4 ready</span><a className="button button-download" href={exportUrl} download={(project.title || "sochozara-video").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".mp4"}>Download MP4 ↓</a></div>}
                </article>

                <article className="panel scene-panel">
                  <div className="panel-heading"><div><span className="step-number">04</span><div><h2>Storyboard</h2><p>Select a scene to edit its visuals and captions.</p></div></div><button className="add-scene" onClick={addScene}>＋ Add</button></div>
                  <div className="scene-list">
                    {project.scenes.map((scene, index) => (
                      <button key={scene.id} className={"scene-row " + (scene.id === selectedScene?.id ? "selected" : "")} onClick={() => { setSelectedSceneId(scene.id); setIsPlaying(false); setPlayhead(getSceneStartTime(project.scenes, scene.id)); }}>
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
                      <div className="artwork-workflow">
                        <div className="artwork-provider-row">
                          <label className="field-label" htmlFor="visual-provider">CREATE SCENE ARTWORK</label>
                          <select id="visual-provider" value={visualProvider} onChange={(event) => setVisualProvider(event.target.value as "adobe-firefly" | "pexels" | "other")}>
                            <option value="adobe-firefly">Adobe Firefly · free daily generations</option>
                            <option value="pexels">Pexels · free stock media</option>
                            <option value="other">Other generator / my own artwork</option>
                          </select>
                        </div>
                        <div className="prompt-actions">
                          <button className="text-button" onClick={() => navigator.clipboard.writeText(buildSceneImagePrompt(selectedScene, project.aspectRatio)).then(() => setNotice("Full branded scene prompt copied. Paste it into the selected visual generator.")).catch(() => setNotice("Clipboard unavailable. Select and copy the prompt manually."))}>▣ Copy full scene prompt</button>
                          {visualProvider === "adobe-firefly" && <a href="https://firefly.adobe.com/" target="_blank" rel="noreferrer">Open Firefly ↗</a>}
                          {visualProvider === "pexels" && <a href="https://www.pexels.com/videos/" target="_blank" rel="noreferrer">Browse Pexels ↗</a>}
                          {visualProvider === "other" && <span className="microcopy">Use any generator whose terms permit your intended use.</span>}
                        </div>
                        <small className="asset-rights-hint">
                          Firefly Free has limited daily generations. For commercial projects, use an Adobe Firefly model and a non-beta feature; partner models may have different terms. Gemini image-generation API models currently do not include a free API tier.
                          <a href="https://www.adobe.com/in/products/firefly.html" target="_blank" rel="noreferrer"> Firefly plans ↗</a>
                        </small>
                      </div>
                      <div className="scene-editor-bottom">
                        <div><label className="field-label">DURATION (SECONDS)</label><input type="number" min="1" max="90" value={selectedScene.duration} onChange={(event) => updateScene(selectedScene.id, { duration: Math.max(1, Math.min(90, Number(event.target.value) || 1)) })} /></div>
                        <label className="button button-secondary file-button">{selectedScene.imageDataUrl ? "↻ Replace artwork" : "＋ Import generated artwork"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleSceneImage(selectedScene.id, event)} /></label>
                      </div>
                      {selectedScene.imageDataUrl && (
                        <div className="asset-rights-box">
                          <label className="field-label">ASSET SOURCE / LICENCE NOTE</label>
                          <input value={selectedScene.imageSourceNote || ""} onChange={(event) => updateScene(selectedScene.id, { imageSourceNote: event.target.value })} placeholder="e.g. Adobe Firefly · Firefly Image model · generated 26 Nov 2026" />
                          <label className="rights-confirm">
                            <input type="checkbox" checked={Boolean(selectedScene.imageCommercialUseConfirmed)} onChange={(event) => updateScene(selectedScene.id, { imageCommercialUseConfirmed: event.target.checked })} />
                            <span>I checked the selected model/asset licence and confirm I can use this artwork in the intended video.</span>
                          </label>
                          <button className="text-button remove-artwork" onClick={() => updateScene(selectedScene.id, { imageDataUrl: undefined, imageCommercialUseConfirmed: false, imageSourceNote: undefined, imageProvider: undefined })}>Remove scene artwork</button>
                        </div>
                      )}
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