import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  WebMOutputFormat,
  Output,
  Quality,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import type { Scene, StudioProject } from "../types";
import { getSceneVideoSrc } from "./stock-video";
import { drawSceneFrame, type SceneTransition } from "./scene-visuals";
import { createExportAbortError, throwIfExportAborted } from "./export-cancel";
import { shouldUseWebmFallback } from "./export-format";

export interface ExportProgress {
  progress: number;
  message: string;
}

function loadImage(dataUrl: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", abort);
    };
    const ready = () => { cleanup(); resolve(image); };
    const failed = () => { cleanup(); reject(new Error("One of the scene images could not be loaded.")); };
    const abort = () => {
      cleanup();
      image.src = "";
      reject(createExportAbortError());
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = ready;
    image.onerror = failed;
    image.src = dataUrl;
  });
}

async function loadSceneVideo(scene: Scene, signal?: AbortSignal): Promise<HTMLVideoElement> {
  const source = getSceneVideoSrc(scene, "medium");
  if (!source) throw new Error("Scene “" + scene.title + "” has no video clip.");
  throwIfExportAborted(signal);
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = source;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while loading video clip for “" + scene.title + "”."));
    }, 30000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", abort);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => {
      cleanup();
      reject(new Error("Could not load the video clip for “" + scene.title + "”. Check the Pixabay setup or replace the clip."));
    };
    const abort = () => {
      cleanup();
      video.pause();
      video.removeAttribute("src");
      video.load();
      reject(createExportAbortError());
    };
    if (signal?.aborted) { abort(); return; }
    video.addEventListener("canplay", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    video.load();
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) ready();
  });
  return video;
}

function waitUntil(deadline: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    const cleanup = () => {
      if (frame) cancelAnimationFrame(frame);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(createExportAbortError());
    };
    const tick = () => {
      if (signal?.aborted) { abort(); return; }
      if (performance.now() >= deadline) { cleanup(); resolve(); }
      else frame = requestAnimationFrame(tick);
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    frame = requestAnimationFrame(tick);
  });
}

function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
    if (Math.abs(video.currentTime - target) < 0.08) { resolve(); return; }
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Could not seek the selected scene video."));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", ready);
      video.removeEventListener("error", failed);
      signal?.removeEventListener("abort", abort);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => {
      cleanup();
      reject(new Error("The selected scene video could not be decoded."));
    };
    const abort = () => {
      cleanup();
      reject(createExportAbortError());
    };
    if (signal?.aborted) { abort(); return; }
    video.addEventListener("seeked", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    video.currentTime = target;
  });
}

function sceneAtTime(scenes: Scene[], time: number): { scene: Scene; index: number; offset: number } {
  let elapsed = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (time < elapsed + scene.duration || index === scenes.length - 1) {
      return { scene, index, offset: time - elapsed };
    }
    elapsed += scene.duration;
  }
  return { scene: scenes[0], index: 0, offset: 0 };
}

async function decodeAudio(dataUrl: string, maxDuration: number): Promise<AudioBuffer> {
  const response = await fetch(dataUrl);
  const bytes = await response.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(bytes);
    const frameCount = Math.max(1, Math.min(decoded.length, Math.ceil(maxDuration * decoded.sampleRate)));
    const trimmed = audioContext.createBuffer(decoded.numberOfChannels, frameCount, decoded.sampleRate);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      trimmed.copyToChannel(decoded.getChannelData(channel).slice(0, frameCount), channel);
    }
    return trimmed;
  } finally {
    await audioContext.close();
  }
}

async function mixWithOriginalAmbientBed(
  narration: AudioBuffer | undefined,
  duration: number,
): Promise<AudioBuffer> {
  // Produce a broadly supported AAC input regardless of the source voice
  // codec. Older mono/22.05 kHz buffers can be rejected by mobile encoders.
  const sampleRate = 48_000;
  const channelCount = 2;
  const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
  const audioContext = new AudioContext({ sampleRate });
  try {
    const mixed = audioContext.createBuffer(channelCount, frameCount, sampleRate);
    const voiceChannels = narration
      ? Array.from({ length: narration.numberOfChannels }, (_, channel) => narration.getChannelData(channel))
      : [];
    const roots = [110, 130.81, 98, 146.83];

    for (let channel = 0; channel < channelCount; channel += 1) {
      const output = mixed.getChannelData(channel);
      const voice = voiceChannels.length ? voiceChannels[Math.min(channel, voiceChannels.length - 1)] : undefined;
      for (let frame = 0; frame < frameCount; frame += 1) {
        const time = frame / sampleRate;
        const root = roots[Math.floor(time / 8) % roots.length];
        const slow = 0.72 + 0.28 * Math.sin(time * 0.19);
        const pad = Math.sin(2 * Math.PI * root * time)
          + 0.42 * Math.sin(2 * Math.PI * root * 1.5 * time + 0.3)
          + 0.28 * Math.sin(2 * Math.PI * root * 2 * time + 0.7)
          + 0.12 * Math.sin(2 * Math.PI * root * 2.5 * time + 0.2);
        const fadeIn = Math.min(1, time / 1.6);
        const fadeOut = Math.min(1, Math.max(0, (duration - time) / 2.5));
        const music = pad * slow * fadeIn * fadeOut * (voice ? 0.026 : 0.052);

        let spoken = 0;
        if (voice && narration) {
          const sourcePosition = frame * narration.sampleRate / sampleRate;
          const lower = Math.min(voice.length - 1, Math.floor(sourcePosition));
          const upper = Math.min(voice.length - 1, lower + 1);
          const fraction = sourcePosition - lower;
          spoken = (voice[lower] * (1 - fraction) + voice[upper] * fraction) * 0.92;
        }
        output[frame] = Math.max(-0.98, Math.min(0.98, spoken + music));
      }
    }
    return mixed;
  } finally {
    await audioContext.close();
  }
}
export async function exportMp4(
  project: StudioProject,
  onProgress: (progress: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfExportAborted(signal);
  if (!project.scenes.length) throw new Error("Add at least one scene before exporting.");
  const unverifiedImages = project.scenes.filter((scene) => scene.imageDataUrl && !scene.imageCommercialUseConfirmed && !scene.imageGeneratedByAI);
  if (unverifiedImages.length) throw new Error("Confirm image usage rights before exporting: " + unverifiedImages.map((scene) => scene.title).join(", ") + ".");
  const unverifiedVideo = project.scenes.filter((scene) =>
    (scene.videoDataUrl || (scene.videoClipSource === "pixabay" && scene.videoClipId)) && !scene.videoGeneratedByAI && !scene.videoCommercialUseConfirmed,
  );
  if (unverifiedVideo.length) throw new Error("Confirm imported footage usage rights before exporting: " + unverifiedVideo.map((scene) => scene.title).join(", ") + ".");
  if (project.scenes.length > 80) throw new Error("A project can contain up to 80 scenes. Split this video into smaller parts.");
  if (project.scenes.some((scene) => !Number.isFinite(scene.duration) || scene.duration <= 0 || scene.duration > 90)) {
    throw new Error("Every scene must have a valid duration between 1 and 90 seconds.");
  }
  const duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  if (!Number.isFinite(duration) || duration > 600) {
    throw new Error("This browser renderer supports videos up to 10 minutes. Split longer projects into parts.");
  }
  if (!("VideoEncoder" in window)) {
    throw new Error("This browser does not support WebCodecs video encoding. Try an up-to-date desktop Chrome or Edge browser.");
  }

  const vertical = project.aspectRatio === "9:16";
  const width = vertical ? 1080 : 1920;
  const height = vertical ? 1920 : 1080;
  const fps = 30;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the video rendering canvas.");

  onProgress({ progress: 0.02, message: "Preparing in-house animated scenes…" });
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  const releaseVideos = () => {
    videos.forEach((video) => { video.pause(); video.removeAttribute("src"); video.load(); });
    videos.clear();
  };
  try {
    for (const scene of project.scenes) {
      if (scene.imageDataUrl) images.set(scene.id, await loadImage(scene.imageDataUrl, signal));
      throwIfExportAborted(signal);
      if (getSceneVideoSrc(scene)) videos.set(scene.id, await loadSceneVideo(scene, signal));
      throwIfExportAborted(signal);
    }
  } catch (error) {
    releaseVideos();
    throw error;
  }

  let format: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat();
  let videoCodec: Awaited<ReturnType<typeof getFirstEncodableVideoCodec>>;
  let audioCodec: Awaited<ReturnType<typeof getFirstEncodableAudioCodec>>;
  let usingWebmFallback = false;
  try {
    videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height, frameRate: fps });
    throwIfExportAborted(signal);
    audioCodec = await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs());
    throwIfExportAborted(signal);

    // Prefer MP4, but use WebM if this browser cannot encode either the MP4
    // video stream or its required narration audio track.
    if (shouldUseWebmFallback(Boolean(videoCodec), Boolean(audioCodec), Boolean(project.voiceAudioDataUrl))) {
      format = new WebMOutputFormat();
      videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height, frameRate: fps });
      throwIfExportAborted(signal);
      audioCodec = await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs());
      throwIfExportAborted(signal);
      usingWebmFallback = Boolean(videoCodec);
      if (!videoCodec) {
        throw new Error("This device cannot encode MP4 (H.264) or WebM (VP8/VP9) video. Update Chrome or try another supported browser/device.");
      }
      if (project.voiceAudioDataUrl && !audioCodec) {
        throw new Error("This browser cannot encode narration audio in MP4 or WebM. Update Chrome or try another supported browser/device.");
      }
      onProgress({
        progress: 0.025,
        message: "This device cannot encode the required MP4 tracks. Using compatible WebM video output…",
      });
    }
    if (!videoCodec) {
      throw new Error("No compatible video encoder was selected for this device.");
    }
  } catch (error) {
    releaseVideos();
    throw error;
  }
  const output = new Output({ format, target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: new Quality({ bitrate: vertical ? 6_000_000 : 8_000_000 }),
    latencyMode: "quality",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | undefined;
  if (audioCodec) {
    audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: 128_000 }) });
    output.addAudioTrack(audioSource);
  }

  output.setMetadataTags({ title: project.title || "SochoZara Studio", artist: "SochoZara" });
  const cancelOutput = () => {
    if (output.state === "started" || output.state === "finalizing") void output.cancel();
  };
  signal?.addEventListener("abort", cancelOutput);
  const totalFrames = Math.ceil(duration * fps);
  let activeSceneId = "";
  let activeVideo: HTMLVideoElement | undefined;
  let transitionVideoId = "";
  const renderStartedAt = performance.now();
  try {
    await output.start();
    throwIfExportAborted(signal);
    for (let frame = 0; frame < totalFrames; frame += 1) {
      throwIfExportAborted(signal);
      const time = frame / fps;
      if (frame > 0) await waitUntil(renderStartedAt + time * 1000, signal);
      throwIfExportAborted(signal);
      const current = sceneAtTime(project.scenes, time);
      const nextVideo = videos.get(current.scene.id);
      if (activeSceneId !== current.scene.id) {
        activeVideo?.pause();
        activeVideo = nextVideo;
        activeSceneId = current.scene.id;
        if (activeVideo) {
          const clipStart = Math.max(0, current.scene.videoClipStart || 0);
          await seekVideo(activeVideo, clipStart, signal);
          await activeVideo.play();
        }
      }
      if (activeVideo && activeVideo.paused) await activeVideo.play();
      const nextScene = project.scenes[current.index + 1];
      const transitionDuration = Math.min(0.65, current.scene.duration * 0.18);
      const rawTransition = nextScene
        ? Math.max(0, Math.min(1, (current.offset - (current.scene.duration - transitionDuration)) / transitionDuration))
        : 0;
      const transitionProgress = rawTransition * rawTransition * (3 - 2 * rawTransition);
      let transitionVideo: HTMLVideoElement | undefined;
      if (nextScene && transitionProgress > 0) {
        transitionVideo = videos.get(nextScene.id);
        if (transitionVideo && transitionVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          if (transitionVideoId !== nextScene.id) {
            await seekVideo(transitionVideo, Math.max(0, nextScene.videoClipStart || 0), signal);
            await transitionVideo.play();
            transitionVideoId = nextScene.id;
          } else if (transitionVideo.paused) {
            await transitionVideo.play();
          }
        } else if (transitionVideo) {
          transitionVideo = undefined;
        }
      }
      const transition: SceneTransition | undefined = nextScene && transitionProgress > 0
        ? {
            scene: nextScene,
            image: images.get(nextScene.id),
            video: transitionVideo,
            index: current.index + 1,
            progress: transitionProgress,
          }
        : undefined;
      drawSceneFrame(
        context,
        width,
        height,
        current.scene,
        images.get(current.scene.id),
        activeVideo,
        current.offset,
        current.scene.duration,
        current.index,
        project.scenes.length,
        time,
        duration,
        transition,
      );
      await videoSource.add(time, 1 / fps);
      throwIfExportAborted(signal);
      if (frame % 12 === 0 || frame === totalFrames - 1) {
        onProgress({
          progress: 0.05 + 0.88 * ((frame + 1) / totalFrames),
          message: "Generating in-house motion video · frame " + (frame + 1) + " of " + totalFrames + "…",
        });
      }
    }
    activeVideo?.pause();
    videoSource.close();
    if (audioSource) {
      onProgress({ progress: 0.94, message: "Mixing narration with an original ambient soundtrack…" });
      const narrationBuffer = project.voiceAudioDataUrl
        ? await decodeAudio(project.voiceAudioDataUrl, duration)
        : undefined;
      throwIfExportAborted(signal);
      const soundtrack = await mixWithOriginalAmbientBed(narrationBuffer, duration);
      throwIfExportAborted(signal);
      await audioSource.add(soundtrack);
      throwIfExportAborted(signal);
      audioSource.close();
    }
    onProgress({ progress: 0.97, message: usingWebmFallback ? "Finalising WebM video…" : "Finalising MP4…" });
    throwIfExportAborted(signal);
    await output.finalize();
    throwIfExportAborted(signal);
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) throw new Error("The video encoder finished without producing any video data. Try a shorter project or a different browser/device.");
    onProgress({
      progress: 1,
      message: usingWebmFallback ? "Your WebM video is ready to download." : "Your MP4 video is ready to download.",
    });
    return new Blob([buffer], { type: format.mimeType });
  } catch (error) {
    activeVideo?.pause();
    if (output.state !== "canceled" && output.state !== "finalized") {
      await output.cancel().catch(() => undefined);
    }
    try { videoSource.close(); } catch { /* output cancellation may already have closed the source */ }
    try { audioSource?.close(); } catch { /* output cancellation may already have closed the source */ }
    if (signal?.aborted) throw createExportAbortError();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelOutput);
    releaseVideos();
  }
}