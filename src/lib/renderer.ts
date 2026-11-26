import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import type { Scene, StudioProject } from "../types";

export interface ExportProgress {
  progress: number;
  message: string;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("One of the scene images could not be loaded."));
    image.src = dataUrl;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  image: HTMLImageElement | undefined,
  elapsed: number,
  duration: number,
  sceneIndex: number,
  sceneCount: number,
): void {
  const progress = Math.min(1, Math.max(0, elapsed / Math.max(duration, 0.01)));
  const drift = Math.sin(elapsed * 0.7) * width * 0.012;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#071426");
  gradient.addColorStop(0.58, "#10233b");
  gradient.addColorStop(1, "#060b14");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (image) {
    const scale = Math.max(width / image.width, height / image.height) * (1.04 + progress * 0.045);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.drawImage(image, (width - drawWidth) / 2 + drift, (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.save();
    for (let i = 0; i < 8; i += 1) {
      const x = width * (0.12 + (i % 4) * 0.24) + Math.sin(elapsed * 0.55 + i) * width * 0.025;
      const y = height * (0.2 + Math.floor(i / 4) * 0.26) + Math.cos(elapsed * 0.42 + i) * height * 0.025;
      const radius = width * (0.045 + (i % 3) * 0.015);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, i % 2 ? "rgba(32,217,235,.30)" : "rgba(255,157,65,.24)");
      glow.addColorStop(1, "rgba(10,18,32,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(3,9,18,.50)");
  overlay.addColorStop(0.36, "rgba(3,9,18,.12)");
  overlay.addColorStop(0.54, "rgba(3,9,18,.46)");
  overlay.addColorStop(1, "rgba(3,9,18,.95)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#24D6E8";
  ctx.fillRect(width * 0.075, height * 0.072, width * 0.055, Math.max(4, height * 0.005));
  ctx.fillStyle = "#F5F7FA";
  ctx.font = "700 " + Math.round(width * 0.027) + "px Arial";
  ctx.textAlign = "left";
  ctx.fillText("SOCHOZARA", width * 0.075, height * 0.12);
  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.font = "500 " + Math.round(width * 0.021) + "px Arial";
  ctx.fillText("DUNIYA KE FACTS. EK NAYA ANGLE.", width * 0.075, height * 0.15);

  const title = scene.title.toUpperCase();
  ctx.fillStyle = "#20D9EC";
  ctx.font = "700 " + Math.round(width * 0.031) + "px Arial";
  ctx.fillText("CHAPTER " + String(sceneIndex + 1).padStart(2, "0"), width * 0.075, height * 0.69);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 " + Math.round(width * 0.068) + "px Arial";
  const titleLines = wrapText(ctx, title, width * 0.84).slice(0, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, width * 0.075, height * 0.75 + index * height * 0.075));

  const captionLines = wrapText(ctx, scene.caption || scene.narration, width * 0.84).slice(0, 3);
  ctx.fillStyle = "rgba(246,249,252,.88)";
  ctx.font = "500 " + Math.round(width * 0.032) + "px Arial";
  const captionY = height * 0.88;
  captionLines.forEach((line, index) => ctx.fillText(line, width * 0.075, captionY + index * height * 0.042));

  const barY = height * 0.965;
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(width * 0.075, barY, width * 0.85, Math.max(3, height * 0.004));
  ctx.fillStyle = "#F59B48";
  ctx.fillRect(width * 0.075, barY, width * 0.85 * ((sceneIndex + progress) / Math.max(1, sceneCount)), Math.max(3, height * 0.004));
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

export async function exportMp4(
  project: StudioProject,
  onProgress: (progress: ExportProgress) => void,
): Promise<Blob> {
  if (!project.scenes.length) throw new Error("Add at least one scene before exporting.");
  if (!("VideoEncoder" in window)) {
    throw new Error("This browser does not support WebCodecs video encoding. Try an up-to-date desktop Chrome or Edge browser.");
  }

  const vertical = project.aspectRatio === "9:16";
  const width = vertical ? 720 : 1280;
  const height = vertical ? 1280 : 720;
  const fps = 24;
  const duration = project.scenes.reduce((sum, scene) => sum + Math.max(1, scene.duration), 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the video rendering canvas.");

  onProgress({ progress: 0.02, message: "Preparing scene artwork…" });
  const images = new Map<string, HTMLImageElement>();
  for (const scene of project.scenes) {
    if (scene.imageDataUrl) images.set(scene.id, await loadImage(scene.imageDataUrl));
  }

  const format = new Mp4OutputFormat();
  const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height });
  if (!videoCodec) {
    throw new Error("This browser does not expose an MP4-compatible video encoder. Try Chrome on a desktop or another supported device.");
  }
  const output = new Output({ format, target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    quality: new Quality({ bitrate: vertical ? 3_000_000 : 4_000_000 }),
    latencyMode: "quality",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | undefined;
  if (project.voiceAudioDataUrl) {
    const audioCodec = await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs());
    if (!audioCodec) throw new Error("This browser cannot encode AAC audio for an MP4 export.");
    audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: 128_000 }) });
    output.addAudioTrack(audioSource);
  }

  output.setMetadataTags({ title: project.title || "SochoZara Studio", artist: "SochoZara" });
  await output.start();
  const totalFrames = Math.ceil(duration * fps);
  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const time = frame / fps;
      const current = sceneAtTime(project.scenes, time);
      drawSceneFrame(
        context,
        width,
        height,
        current.scene,
        images.get(current.scene.id),
        current.offset,
        current.scene.duration,
        current.index,
        project.scenes.length,
      );
      await videoSource.add(time, 1 / fps);
      if (frame % 12 === 0 || frame === totalFrames - 1) {
        onProgress({
          progress: 0.05 + 0.88 * ((frame + 1) / totalFrames),
          message: "Rendering frame " + (frame + 1) + " of " + totalFrames + "…",
        });
      }
    }
    videoSource.close();
    if (audioSource && project.voiceAudioDataUrl) {
      onProgress({ progress: 0.94, message: "Adding narration audio…" });
      const audioBuffer = await decodeAudio(project.voiceAudioDataUrl, duration);
      await audioSource.add(audioBuffer);
      audioSource.close();
    }
    onProgress({ progress: 0.97, message: "Finalising MP4…" });
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("The MP4 renderer completed without producing a file.");
    onProgress({ progress: 1, message: "Your video is ready." });
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    videoSource.close();
    audioSource?.close();
    throw error;
  }
}