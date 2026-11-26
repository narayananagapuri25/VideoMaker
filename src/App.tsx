import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { generateStory, testGeminiConnection } from "./lib/ai";
import { deriveTopicFromScript, makeProject, parsePastedNarration, scenesFromScript } from "./lib/story";
import { loadLatestProject, saveProject } from "./lib/storage";
import { generateNarration } from "./lib/tts";
import { buildSceneImagePrompt } from "./lib/art-prompt";
import { getSceneStartTime, getTimelineDuration } from "./lib/timeline";
import PlaybackTimeline from "./components/PlaybackTimeline";
import CreatorKit from "./components/CreatorKit";
import StockVideoPanel from "./components/StockVideoPanel";
import type { AspectRatio, Language, Scene, StudioProject } from "./types";
import { getEmbeddedImageSize, getEmbeddedVideoSize, getProjectMediaSize, isSupportedImageMimeType, MAX_NARRATION_AUDIO_BYTES, MAX_PROJECT_MEDIA_BYTES, MAX_SCENE_IMAGE_BYTES } from "./lib/media-data";
import { MAX_PROJECT_BACKUP_BYTES, restoreProjectBackup } from "./lib/project-backup";
import { getUnverifiedSceneMedia } from "./lib/video-generation";
import { isExportAbortError } from "./lib/export-cancel";
import { getVideoFileExtension } from "./lib/export-format";
import { clearGeminiSessionKey, getGeminiSessionHeaders, hasGeminiSessionKey, saveGeminiSessionKey } from "./lib/gemini-session";

const initialProject = () => makeProject("Why do we see lightning before thunder?", "English", "9:16", 45);

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
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [geminiSessionKeyInput, setGeminiSessionKeyInput] = useState("");
  const [geminiSessionKeySaved, setGeminiSessionKeySaved] = useState(() => hasGeminiSessionKey());
  const [activeSection, setActiveSection] = useState<"studio" | "guide">("studio");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingFullVideo, setIsGeneratingFullVideo] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    status: "testing" | "success" | "error";
    message: string;
  } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [exportFileType, setExportFileType] = useState<"mp4" | "webm">("mp4");
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
  const renderAbortRef = useRef<AbortController | null>(null);

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
    project.storyboardSourceAspectRatio === project.aspectRatio &&
    project.storyboardSourceLanguage === project.language;
  const handlePlaybackError = useCallback((message: string) => setNotice(message), []);

  useEffect(() => {
    let active = true;
    setGeminiSessionKeySaved(hasGeminiSessionKey());
    fetch("/api/ai/status", { headers: getGeminiSessionHeaders(), cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Gemini server status is unavailable.");
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null || !("configured" in payload)) {
          throw new Error("Gemini server status response is invalid.");
        }
        // A key may be saved while the initial status request is still in flight.
        // Re-check session storage at response time so a stale "not configured"
        // response cannot overwrite the newly saved tab key.
        if (active) setGeminiConfigured(hasGeminiSessionKey() || Boolean(payload.configured));
      })
      .catch(() => {
        if (active) setGeminiConfigured(false);
      });
    return () => { active = false; };
  }, []);

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
            language: "English",
            title: pasted ? topic : saved.title,
            topic,
            script: restoredScript,
            scenes: restoredScenes,
            storyboardSourceTopic: pasted ? topic : saved.storyboardSourceTopic,
            storyboardSourceScript: pasted ? restoredScript : saved.storyboardSourceScript,
            storyboardSourceTargetDuration: pasted ? saved.targetDuration : saved.storyboardSourceTargetDuration,
            storyboardSourceAspectRatio: pasted ? saved.aspectRatio : saved.storyboardSourceAspectRatio,
            storyboardSourceLanguage: "English",
            editorialNote: pasted ? pasted.editorialNote : saved.editorialNote,
          };
          setProject(restored);
          setSelectedSceneId(restored.scenes[0]?.id ?? "");
          if (pasted) setGenerationSource("provided-script");
          setNotice(pasted
            ? "Recovered your pasted narration and rebuilt its scenes. Language is set to English; generate a new English script if this text is in another language."
            : "Restored your local project. Language is now English; regenerate the story to replace any older non-English script with an English version.");
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
    setExportFileType("mp4");
  }

  function updateProject(patch: Partial<StudioProject>) {
    if (["topic", "script", "scenes", "targetDuration", "aspectRatio", "language", "voiceAudioDataUrl"].some((key) => key in patch)) {
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

  function wouldExceedMediaLimit(additionalBytes: number, replacingSceneId?: string, replacingAudio = false): boolean {
    const currentBytes = getProjectMediaSize(project.scenes, project.voiceAudioDataUrl, replacingSceneId, replacingAudio);
    if (currentBytes + additionalBytes > MAX_PROJECT_MEDIA_BYTES) {
      setNotice("This project has a 64 MB combined image, video and audio limit in local storage. Remove unused media or use smaller files before adding more.");
      return true;
    }
    return false;
  }

  function wouldExceedVideoMediaLimit(additionalBytes: number, replacingSceneId: string): boolean {
    const currentBytes = getProjectMediaSize(project.scenes, project.voiceAudioDataUrl, undefined, false, replacingSceneId);
    if (currentBytes + additionalBytes > MAX_PROJECT_MEDIA_BYTES) {
      setNotice("This project has a 64 MB combined image, video and audio limit in local storage. Remove unused media or use smaller files before adding more.");
      return true;
    }
    return false;
  }

  function handleSaveGeminiSessionKey() {
    try {
      saveGeminiSessionKey(geminiSessionKeyInput);
      setGeminiSessionKeyInput("");
      setGeminiSessionKeySaved(true);
      setGeminiConfigured(true);
      setGeminiTestResult(null);
      setNotice("Gemini key saved for this browser tab. Test the connection before generating a video.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the Gemini key for this tab.");
    }
  }

  function handleClearGeminiSessionKey() {
    clearGeminiSessionKey();
    setGeminiSessionKeySaved(false);
    setGeminiConfigured(null);
    setGeminiTestResult(null);
    setNotice("The Gemini key was removed from this tab session.");
    fetch("/api/ai/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (typeof payload === "object" && payload !== null && "configured" in payload) {
          setGeminiConfigured(Boolean(payload.configured));
        }
      })
      .catch(() => setGeminiConfigured(false));
  }

  async function handleTestGemini() {
    const testingMessage = geminiSessionKeySaved
      ? "Testing the Gemini key saved in this browser tab…"
      : "Testing the Gemini connection configured for this site…";
    setIsTestingGemini(true);
    setGeminiTestResult({ status: "testing", message: testingMessage });
    setNotice(testingMessage);
    try {
      const result = await testGeminiConnection();
      setGeminiConfigured(true);
      setGeminiTestResult({ status: "success", message: result });
      setNotice(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini connection test failed.";
      setGeminiConfigured(false);
      setGeminiTestResult({ status: "error", message });
      setNotice(message);
    } finally {
      setIsTestingGemini(false);
    }
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
        storyboardSourceLanguage: project.language,
      });
      setSelectedSceneId(scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
      setGenerationSource("provided-script");
      setNotice("Pasted narration detected and preserved. Matching scenes were created from your actual lines; no generic filler was added. The scientific note stays outside the spoken script.");
      return;
    }
    setIsGenerating(true);
    setNotice("Sending your topic to the secure Gemini server for story and scene direction…");
    try {
      const result = await generateStory({
        topic: project.topic,
        language: project.language,
        targetDuration: project.targetDuration,
        aspectRatio: project.aspectRatio,
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
        storyboardSourceLanguage: project.language,
      });
      setSelectedSceneId(scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
      setGenerationSource(result.source);
      setGeminiConfigured(true);
      setNotice("Gemini created the story and scene direction. Verify factual claims before publishing.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Story generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  function rebuildScenesFromScript() {
    // If a full narration is currently pasted into the Topic field, it is the
    // source of truth. Never rebuild from an older script left by a previous draft.
    const sourceScript = pastedNarration?.script ?? project.script.trim();
    if (!sourceScript) {
      setNotice("Paste narration or add script text before rebuilding the storyboard.");
      return;
    }
    const topic = pastedNarration ? deriveTopicFromScript(sourceScript) : project.topic;
    const editorialNote = pastedNarration?.editorialNote ?? project.editorialNote;
    const scenes = scenesFromScript(sourceScript, project.targetDuration, topic);
    updateProject({
      ...(pastedNarration ? { title: topic, topic, script: sourceScript, editorialNote } : {}),
      scenes,
      storyboardSourceTopic: topic,
      storyboardSourceScript: sourceScript,
      storyboardSourceTargetDuration: project.targetDuration,
      storyboardSourceAspectRatio: project.aspectRatio,
      storyboardSourceLanguage: project.language,
    });
    setSelectedSceneId(scenes[0]?.id ?? "");
    setPlayhead(0);
    setIsPlaying(false);
    if (pastedNarration) {
      setGenerationSource("provided-script");
      setNotice("Pasted narration applied. Previous draft text removed, scientific note kept separate, and scenes rebuilt only from your narration.");
    } else {
      setNotice("Storyboard rebuilt from your current script.");
    }
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
    if (wouldExceedMediaLimit(file.size, sceneId)) {
      event.target.value = "";
      return;
    }
    try {
      const imageDataUrl = await fileToDataUrl(file);
      if (getEmbeddedImageSize(imageDataUrl) === null) {
        throw new Error("The selected file content does not match a supported image format. Choose a valid PNG, JPEG, WebP, GIF, AVIF or BMP image.");
      }
      updateScene(sceneId, { imageDataUrl, imageProvider: visualProvider, imageCommercialUseConfirmed: false, imageSourceNote: visualProvider === "adobe-firefly" ? "Adobe Firefly · confirm selected Adobe model and non-beta feature" : visualProvider === "pexels" ? "Pexels · record asset URL/creator and verify licence" : "Other source · record model/provider and licence" });
      setNotice("Scene artwork added. Review its commercial-use terms and confirm the asset rights in the scene editor.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Image upload failed.");
    }
    event.target.value = "";
  }

  async function handleGenerateAiVoice() {
    if (!project.script.trim()) {
      setNotice("Add narration text before generating AI voice.");
      return;
    }
    setIsGeneratingVoice(true);
    setNotice("Step 1/1 · Sending your script to the secure Gemini narration service…");
    try {
      const audio = await generateNarration(project.script, ttsVoice, "English");
      if (audio.size > MAX_NARRATION_AUDIO_BYTES) throw new Error("Generated narration is larger than 30 MB. Use a shorter script.");
      if (wouldExceedMediaLimit(audio.size, undefined, true)) return;
      const audioDataUrl = await fileToDataUrl(audio);
      updateProject({ voiceAudioDataUrl: audioDataUrl, voiceAudioName: "Gemini TTS · " + ttsVoice + ".wav" });
      setGeminiConfigured(true);
      setNotice("English Gemini narration generated and saved locally. Preview the WAV before exporting.");
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
    if (wouldExceedMediaLimit(file.size, undefined, true)) {
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
          if (blob.size > MAX_NARRATION_AUDIO_BYTES) {
            setRecordingError("Recording is larger than 30 MB. Record a shorter narration and try again.");
            setIsRecording(false);
            return;
          }
          if (wouldExceedMediaLimit(blob.size, undefined, true)) {
            setIsRecording(false);
            return;
          }
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

  async function renderProject(videoProject: StudioProject): Promise<void> {
    const inSync =
      videoProject.storyboardSourceTopic === videoProject.topic &&
      videoProject.storyboardSourceScript === videoProject.script &&
      videoProject.storyboardSourceTargetDuration === videoProject.targetDuration &&
      videoProject.storyboardSourceAspectRatio === videoProject.aspectRatio &&
      videoProject.storyboardSourceLanguage === videoProject.language;
    if (!inSync) {
      setNotice("Video generation paused: the storyboard does not match the current topic or script. Generate the full video again or rebuild the storyboard.");
      return;
    }
    const duration = getTimelineDuration(videoProject.scenes);
    if (videoProject.scenes.length > 80 || duration > 600) {
      setNotice("For reliable on-device rendering, keep videos to 80 scenes and 10 minutes or less. Split longer projects into parts.");
      return;
    }
    const unverifiedAssets = getUnverifiedSceneMedia(videoProject.scenes);
    if (unverifiedAssets.length) {
      setNotice("Confirm usage rights for imported artwork or footage in: " + unverifiedAssets.join(", ") + ".");
      return;
    }
    const abortController = new AbortController();
    renderAbortRef.current = abortController;
    setIsPlaying(false);
    setIsRendering(true);
    setRenderProgress(0);
    setRenderMessage("Preparing the AI-directed scene sequence…");
    setNotice("Rendering your complete video locally. You can cancel at any time; the incomplete MP4 will be discarded.");
    try {
      const { exportMp4 } = await import("./lib/renderer");
      const blob = await exportMp4(videoProject, ({ progress, message }) => {
        setRenderProgress(progress);
        setRenderMessage(message);
      }, abortController.signal);
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      const url = URL.createObjectURL(blob);
      exportUrlRef.current = url;
      setExportUrl(url);
      const fileType = getVideoFileExtension(blob.type);
      setExportFileType(fileType);
      setNotice("Your complete video is ready. Preview it, then download the " + fileType.toUpperCase() + " file.");
    } catch (error) {
      if (abortController.signal.aborted || isExportAbortError(error)) {
        setNotice("MP4 export canceled. Encoder resources were released and no incomplete download was saved.");
      } else {
        setNotice(error instanceof Error ? error.message : "Video generation failed.");
      }
    } finally {
      if (renderAbortRef.current === abortController) renderAbortRef.current = null;
      setIsRendering(false);
    }
  }

  function handleCancelRender() {
    const controller = renderAbortRef.current;
    if (!controller || controller.signal.aborted) return;
    setNotice("Canceling MP4 export and releasing encoder resources…");
    controller.abort();
  }

  async function handleExport() {
    await renderProject(project);
  }

  async function handleGenerateFullVideo() {
    const topic = pastedNarration ? deriveTopicFromScript(pastedNarration.script) : project.topic.trim();
    if (!topic) {
      setNotice("Enter a question or topic before generating your video.");
      return;
    }
    if (isGeneratingFullVideo || isRendering) return;
    setIsGeneratingFullVideo(true);
    setNotice("Step 1/4 · Gemini is writing the story and directing every scene…");
    try {
      const result = await generateStory({
        topic,
        language: "English",
        targetDuration: project.targetDuration,
        aspectRatio: project.aspectRatio,
      });
      setGeminiConfigured(true);
      const scenes: Scene[] = result.story.scenes.map((scene, index) => ({
        ...scene,
        id: globalThis.crypto?.randomUUID?.() ?? ("scene-" + Date.now() + "-" + index),
      }));
      setNotice("Step 2/4 · Gemini has directed " + scenes.length + " scenes. Preparing English documentary narration…");
      const audio = await generateNarration(result.story.script, ttsVoice, "English");
      if (audio.size > MAX_NARRATION_AUDIO_BYTES) {
        throw new Error("Generated narration is larger than 30 MB. Shorten the video and try again.");
      }
      if (wouldExceedMediaLimit(audio.size, undefined, true)) return;
      setNotice("Step 3/4 · Voice-over ready. Preparing the motion-graphics timeline and original soundtrack…");
      const voiceAudioDataUrl = await fileToDataUrl(audio);
      const generatedProject: StudioProject = {
        ...project,
        title: result.story.title,
        topic,
        language: "English",
        script: result.story.script,
        scenes,
        editorialNote: result.story.editorialNote,
        voiceAudioDataUrl,
        voiceAudioName: "Gemini TTS · " + ttsVoice + ".wav",
        storyboardSourceTopic: topic,
        storyboardSourceScript: result.story.script,
        storyboardSourceTargetDuration: project.targetDuration,
        storyboardSourceAspectRatio: project.aspectRatio,
        storyboardSourceLanguage: "English",
        updatedAt: Date.now(),
      };
      updateProject(generatedProject);
      setSelectedSceneId(scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
      setGenerationSource("gemini");
      setNotice("Step 4/4 · Story, scenes and voice are ready. Rendering the MP4 on this device…");
      await renderProject(generatedProject);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Full video generation failed.";
      setNotice("Video generation stopped: " + message);
    } finally {
      setIsGeneratingFullVideo(false);
    }
  }

  function addScene() {
    if (project.scenes.length >= 80) {
      setNotice("A project can contain up to 80 scenes. Remove an unused scene before adding another.");
      return;
    }
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
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setNotice("Project backup downloaded, including imported scene artwork, video footage and narration audio.");
  }

  async function importProjectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PROJECT_BACKUP_BYTES) {
      setNotice("Project backup is larger than 100 MB. Reduce media sizes and try again.");
      event.target.value = "";
      return;
    }
    try {
      const imported = restoreProjectBackup(JSON.parse(await file.text()));
      const pasted = parsePastedNarration(imported.topic);
      if (pasted) {
        const topic = deriveTopicFromScript(pasted.script);
        const recoveredScenes = scenesFromScript(pasted.script, imported.targetDuration, topic);
        imported.title = topic;
        imported.topic = topic;
        imported.script = pasted.script;
        imported.scenes = recoveredScenes;
        imported.storyboardSourceTopic = topic;
        imported.storyboardSourceScript = pasted.script;
        imported.storyboardSourceTargetDuration = imported.targetDuration;
        imported.storyboardSourceAspectRatio = imported.aspectRatio;
        imported.storyboardSourceLanguage = imported.language;
        imported.editorialNote = pasted.editorialNote;
        setGenerationSource("provided-script");
      } else {
        setGenerationSource("local");
      }
      updateProject(imported);
      setSelectedSceneId(imported.scenes[0]?.id ?? "");
      setPlayhead(0);
      setIsPlaying(false);
      setNotice(pasted
        ? "Project imported. Pasted narration was repaired, matching scenes rebuilt and image rights reset for confirmation."
        : "Project imported. Reconfirm imported artwork and video rights, and review narration audio before exporting.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not import this project backup.");
    }
    event.target.value = "";
  }

  function newProject() {
    const fresh = makeProject("Enter your next video topic", "English", "9:16", 45);
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
          <div className="sidebar-version">LOCAL-FIRST CREATOR STUDIO</div>
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
                    <div><label className="field-label" htmlFor="language">LANGUAGE</label><select id="language" value={project.language} onChange={(event) => updateProject({ language: event.target.value as Language })}><option>English</option><option>Hinglish</option><option>Hindi</option><option>Telugu</option></select></div>
                    <div><label className="field-label" htmlFor="ratio">FORMAT</label><select id="ratio" value={project.aspectRatio} onChange={(event) => updateProject({ aspectRatio: event.target.value as AspectRatio })}><option value="9:16">Vertical · 9:16</option><option value="16:9">Landscape · 16:9</option></select></div>
                    <div><label className="field-label" htmlFor="duration">TARGET LENGTH</label><select id="duration" value={project.targetDuration} onChange={(event) => updateProject({ targetDuration: Number(event.target.value) })}><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option><option value={300}>5 minutes</option><option value={480}>8 minutes</option></select></div>
                  </div>
                  <div className="ai-key-box">
                    <div className="key-title"><span>✦</span><strong>Gemini AI connection</strong><em>YOUR API KEY</em></div>
                    <label className="field-label" htmlFor="gemini-api-key">GOOGLE AI STUDIO API KEY</label>
                    <input
                      id="gemini-api-key"
                      className="gemini-key-input"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={geminiSessionKeyInput}
                      onChange={(event) => {
                        setGeminiSessionKeyInput(event.target.value);
                        setGeminiTestResult(null);
                      }}
                      placeholder={geminiSessionKeySaved ? "Key saved for this tab · enter a new key to replace it" : "Paste your Gemini API key"}
                    />
                    <div className="gemini-test-row">
                      <span className={geminiConfigured ? "clip-status ready" : "clip-status"}>
                        {geminiConfigured === null ? "CHECKING…" : geminiSessionKeySaved ? "TAB SESSION KEY SAVED" : geminiConfigured ? "SERVER KEY CONFIGURED" : "KEY REQUIRED"}
                      </span>
                      <button className="button button-primary" disabled={!geminiSessionKeyInput.trim()} onClick={handleSaveGeminiSessionKey}>Save key for this tab</button>
                      {geminiSessionKeySaved && <button className="text-button" onClick={handleClearGeminiSessionKey}>Remove saved key</button>}
                      <button type="button" className="button button-secondary" disabled={isTestingGemini || isGenerating || isGeneratingFullVideo} onClick={handleTestGemini}>{isTestingGemini ? <><span className="spinner" /> Testing…</> : "Test Gemini connection"}</button>
                    </div>
                    {geminiTestResult && (
                      <div
                        id="gemini-test-result"
                        className={"gemini-test-result " + geminiTestResult.status}
                        role={geminiTestResult.status === "error" ? "alert" : "status"}
                        aria-live="polite"
                        aria-atomic="true"
                        aria-busy={geminiTestResult.status === "testing"}
                      >
                        <span className="gemini-test-icon" aria-hidden="true">
                          {geminiTestResult.status === "success" ? "✓" : geminiTestResult.status === "error" ? "!" : "…"}
                        </span>
                        <span>{geminiTestResult.message}</span>
                      </div>
                    )}
                    <small>
                      The key is saved in this browser tab's session storage, survives refreshes in this tab and is removed when the tab session ends. It is not saved in your video project, IndexedDB or GitHub. For Gemini requests, this app sends it over HTTPS to its same-origin Cloudflare Function, which forwards it to Google. Session storage is not a password vault: scripts running on this site can access it, so use this only in a trusted browser and on a device you control. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio ↗</a>
                    </small>
                  </div>
                  <div className="button-row">
                    <button className="button button-primary" disabled={isGenerating} onClick={handleGenerateStory}>{isGenerating ? <><span className="spinner" /> Creating…</> : "✦ Generate story & scenes"}</button>
                    <span className="microcopy">{geminiConfigured ? (geminiSessionKeySaved ? "Gemini · tab session" : "Gemini · server key") : "Save a Gemini key to continue"}</span>
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
                    <div className="audio-empty"><div className="audio-wave">▂ ▅ ▃ ▆ ▄ ▇</div><strong>No narration audio yet</strong><p>Generate an English narration with Gemini AI below. Device voice is available for a quick local preview, but only generated or imported audio is embedded in the MP4.</p></div>
                  )}
                  <div className="tts-controls">
                    <div><label className="field-label">GEMINI AI VOICE</label><select value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)}><option value="Kore">Kore · warm documentary</option><option value="Aoede">Aoede · expressive</option><option value="Puck">Puck · energetic</option><option value="Charon">Charon · deep narrator</option><option value="Fenrir">Fenrir · bold</option><option value="Zephyr">Zephyr · bright</option></select></div>
                    <button className="button button-primary tts-button" disabled={isGeneratingVoice || !project.script.trim()} onClick={handleGenerateAiVoice}>{isGeneratingVoice ? <><span className="spinner" /> Generating voice…</> : project.voiceAudioDataUrl ? "↻ Regenerate Gemini narration" : "✦ Generate Gemini narration"}</button>
                  </div>
                  <small className="tts-disclaimer">Gemini 3.8 Flash TTS · English (India) narration · WAV audio. Generated audio is saved in this browser project and embedded in the MP4. Free-tier use is subject to your Google AI Studio project's quota and data-use terms.</small>
                  <div className="button-row audio-actions">
                    <button className="button button-quiet" onClick={listenWithDeviceVoice} disabled={!project.script.trim()}>▶ Device voice preview (not exported)</button>
                    <label className="button button-secondary file-button">↑ Import audio<input type="file" accept="audio/*" onChange={handleAudioUpload} /></label>
                    {isRecording
                      ? <button className="button button-danger" onClick={stopRecording}>■ Stop recording</button>
                      : <button className="button button-secondary" onClick={startRecording}>● Record voice</button>}
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
                  <div className="inhouse-generator">
                    <div className="inhouse-generator-heading">
                      <span className="inhouse-generator-mark">✦</span>
                      <div><strong>IN-HOUSE VIDEO GENERATOR</strong><small>Free · runs on this device · no Flow or paid video API</small></div>
                      <span className="inhouse-free-tag">FREE</span>
                    </div>
                    <p>Enter a question and let the AI director write the story, plan a different visual for every scene, generate English narration and assemble the MP4. Rendering and graphics run free on this device.</p>
                    <button className="button button-primary export-button" onClick={handleGenerateFullVideo} disabled={isRendering || isGeneratingFullVideo || isGenerating || !project.topic.trim()}>{isGeneratingFullVideo ? <><span className="spinner" /> AI is creating your video…</> : "✦ Generate entire video with AI"}</button>
                    <button className="button button-secondary export-button" onClick={handleExport} disabled={isRendering || isGeneratingFullVideo || !project.scenes.length || !storyboardInSync || getUnverifiedSceneMedia(project.scenes).length > 0}>{isRendering ? <><span className="spinner" /> Rendering…</> : "Render current storyboard"}</button>
                    <span className="export-spec">{project.aspectRatio === "9:16" ? "720 × 1280" : "1280 × 720"} · H.264 · on-device</span>
                    <small className="inhouse-hint">{geminiConfigured ? "Gemini AI writes the script and voice-over through the same-origin server function; scene graphics, soundtrack and video rendering run in-house." : "Save a Google AI Studio key in the Gemini connection panel, then test the connection to enable AI video generation."}</small>
                    {getUnverifiedSceneMedia(project.scenes).length > 0 && <small className="export-blocked-note">Confirm usage rights for imported artwork or footage before generation.</small>}
                  </div>
                  {isRendering && <div className="render-progress"><div className="progress-track"><span style={{ width: (renderProgress * 100) + "%" }} /></div><div className="render-progress-meta"><small>{renderMessage} · {Math.round(renderProgress * 100)}%</small><button className="text-button cancel-render-button" onClick={handleCancelRender}>Cancel export</button></div></div>}
                  {exportUrl && !isRendering && <div className="download-ready"><span>✓ {exportFileType.toUpperCase()} ready</span><a className="button button-download" href={exportUrl} download={(project.title || "sochozara-video").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "." + exportFileType}>Download {exportFileType.toUpperCase()} ↓</a></div>}
                </article>

                <article className="panel scene-panel">
                  <div className="panel-heading"><div><span className="step-number">04</span><div><h2>Storyboard</h2><p>Every scene can be animated locally without importing video clips.</p></div></div><div className="storyboard-header-actions">
                    <button className="add-scene" onClick={addScene}>＋ Add</button>
                  </div></div>
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
                      <StockVideoPanel scene={selectedScene} onChange={(patch) => {
                        if (patch.videoDataUrl) {
                          const size = getEmbeddedVideoSize(patch.videoDataUrl) ?? 0;
                          if (wouldExceedVideoMediaLimit(size, selectedScene.id)) return;
                        }
                        updateScene(selectedScene.id, patch);
                      }} />
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
                        <label className="button button-secondary file-button">{selectedScene.imageDataUrl ? "↻ Replace artwork" : "＋ Import generated artwork"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp" onChange={(event) => handleSceneImage(selectedScene.id, event)} /></label>
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
            <footer className="app-footer"><span>SOCHOZARA STUDIO · BUILT FOR ORIGINAL STORIES</span><span>Local-first · Free in-house motion generation · No automatic uploads</span></footer>
          </div>
        )}
      </main>
    </div>
  );
}