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
import { getSceneVideoSrc } from "./stock-video";

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

async function loadSceneVideo(scene: Scene): Promise<HTMLVideoElement> {
  const source = getSceneVideoSrc(scene, "medium");
  if (!source) throw new Error("Scene “" + scene.title + "” has no video clip.");
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = source;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Timed out while loading video clip for “" + scene.title + "”.")), 30000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("error", failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Could not load the video clip for “" + scene.title + "”. Check the Pixabay setup or replace the clip.")); };
    video.addEventListener("canplay", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.load();
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) ready();
  });
  return video;
}

function waitUntil(deadline: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (performance.now() >= deadline) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
    if (Math.abs(video.currentTime - target) < 0.08) { resolve(); return; }
    const timer = window.setTimeout(() => reject(new Error("Could not seek the selected scene video.")), 8000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", ready);
      video.removeEventListener("error", failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("The selected scene video could not be decoded.")); };
    video.addEventListener("seeked", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = target;
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


function drawSceneMotif(ctx: CanvasRenderingContext2D, width: number, height: number, scene: Scene, elapsed: number): void {
  const subject = (scene.visualPrompt + " " + scene.title + " " + scene.caption).toLowerCase();
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (/earth|equator|earth's rotation|planetary rotation/.test(subject)) {
    const cx = width * 0.5;
    const cy = height * 0.4;
    const radius = width * 0.225;
    ctx.fillStyle = "rgba(214, 238, 255, .55)";
    for (let i = 0; i < 34; i += 1) {
      const x = ((i * 137) % 997) / 997 * width;
      const y = ((i * 71) % 991) / 991 * height * 0.72;
      ctx.globalAlpha = 0.25 + (i % 4) * 0.12;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, width * 0.002), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.92;
    const globe = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.42, radius * 0.04, cx, cy, radius);
    globe.addColorStop(0, "#71dce7");
    globe.addColorStop(0.52, "#19799d");
    globe.addColorStop(1, "#071d46");
    ctx.fillStyle = globe;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.985, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(93, 171, 116, .85)";
    ctx.beginPath();
    ctx.ellipse(cx - radius * 0.31, cy - radius * 0.2, radius * 0.32, radius * 0.19, -0.48, 0, Math.PI * 2);
    ctx.ellipse(cx + radius * 0.28, cy + radius * 0.14, radius * 0.27, radius * 0.16, 0.6, 0, Math.PI * 2);
    ctx.ellipse(cx - radius * 0.08, cy + radius * 0.54, radius * 0.12, radius * 0.24, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(175, 235, 246, .35)";
    ctx.lineWidth = Math.max(1, width * 0.002);
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * 0.52, radius, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy, radius, radius * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(245, 185, 96, .88)";
    ctx.lineWidth = Math.max(2, width * 0.005);
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * 1.48, radius * 0.47, -0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd18b";
    ctx.beginPath();
    ctx.arc(cx + radius * 1.22, cy - radius * 0.16, width * 0.012, 0, Math.PI * 2);
    ctx.fill();

    if (/atmosphere|air|wind|inertia|hawa/.test(subject)) {
      ctx.strokeStyle = "rgba(82, 225, 237, .82)";
      ctx.lineWidth = Math.max(2, width * 0.004);
      for (let i = 0; i < 4; i += 1) {
        const y = height * (0.67 + i * 0.045);
        ctx.beginPath();
        ctx.moveTo(width * 0.12, y);
        ctx.bezierCurveTo(width * 0.35, y - height * 0.08, width * 0.58, y + height * 0.07, width * 0.88, y - height * 0.035);
        ctx.stroke();
      }
    } else if (/ocean|sea|water|samundar|wave|tsunami/.test(subject)) {
      ctx.strokeStyle = "rgba(72, 204, 232, .82)";
      ctx.lineWidth = Math.max(2, width * 0.004);
      for (let i = 0; i < 4; i += 1) {
        const y = height * (0.7 + i * 0.047);
        ctx.beginPath();
        for (let x = width * 0.08; x <= width * 0.92; x += width / 70) {
          const waveY = y + Math.sin(x / width * Math.PI * 5 + elapsed * 1.1 + i) * height * 0.014;
          if (x === width * 0.08) ctx.moveTo(x, waveY);
          else ctx.lineTo(x, waveY);
        }
        ctx.stroke();
      }
    } else if (/city|building|infrastructure|damage/.test(subject)) {
      ctx.fillStyle = "rgba(8, 20, 40, .9)";
      for (let i = 0; i < 9; i += 1) {
        const x = width * (0.08 + i * 0.105);
        const h = height * (0.07 + (i % 4) * 0.025);
        ctx.fillRect(x, height * 0.88 - h, width * 0.075, h);
      }
      ctx.strokeStyle = "rgba(245, 185, 96, .7)";
      ctx.beginPath();
      ctx.moveTo(width * 0.08, height * 0.89);
      ctx.lineTo(width * 0.92, height * 0.89);
      ctx.stroke();
    }
  } else if (/lightning|thunder|storm|rain|bijli/.test(subject)) {
    const cloudY = height * 0.43;
    ctx.fillStyle = "rgba(17, 35, 57, .94)";
    for (let i = 0; i < 6; i += 1) {
      const x = width * (0.2 + i * 0.12);
      const y = cloudY + Math.sin(elapsed * 0.8 + i) * height * 0.009;
      ctx.beginPath();
      ctx.arc(x, y, width * (0.08 + (i % 2) * 0.012), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(43, 213, 231, .32)";
    ctx.lineWidth = Math.max(2, width * 0.003);
    for (let i = 0; i < 12; i += 1) {
      const x = width * (0.13 + i * 0.067);
      const y = height * (0.54 + (i % 3) * 0.08);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - width * 0.018, y + height * 0.045);
      ctx.stroke();
    }
    ctx.shadowColor = "#F5B451";
    ctx.shadowBlur = width * 0.08;
    ctx.strokeStyle = "#F8C66B";
    ctx.lineWidth = Math.max(4, width * 0.008);
    ctx.beginPath();
    ctx.moveTo(width * 0.55, height * 0.43);
    ctx.lineTo(width * 0.48, height * 0.55);
    ctx.lineTo(width * 0.55, height * 0.55);
    ctx.lineTo(width * 0.46, height * 0.70);
    ctx.stroke();
  } else if (/space|planet|black hole|moon|mars|galaxy|orbit|star/.test(subject)) {
    ctx.fillStyle = "rgba(210, 237, 255, .7)";
    for (let i = 0; i < 42; i += 1) {
      const x = ((i * 97) % 997) / 997 * width;
      const y = ((i * 173) % 991) / 991 * height * 0.68;
      const pulse = 0.7 + Math.sin(elapsed * 1.5 + i) * 0.25;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, width * 0.002 * pulse), 0, Math.PI * 2);
      ctx.fill();
    }
    const x = width * 0.5 + Math.sin(elapsed * 0.18) * width * 0.025;
    const y = height * 0.4;
    const radius = width * 0.22;
    const planet = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.05, x, y, radius);
    planet.addColorStop(0, "#75e7ed");
    planet.addColorStop(0.45, "#247b9c");
    planet.addColorStop(1, "#111c4a");
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(245, 155, 72, .7)";
    ctx.lineWidth = Math.max(2, width * 0.006);
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.65, radius * 0.45, -0.24, 0, Math.PI * 2);
    ctx.stroke();
  } else if (/temple|ancient|history|stepwell|architecture|kingdom|historical/.test(subject)) {
    const baseY = height * 0.62;
    ctx.fillStyle = "rgba(245, 155, 72, .18)";
    for (let level = 0; level < 6; level += 1) {
      const inset = level * width * 0.052;
      const y = baseY - level * height * 0.045;
      ctx.fillRect(width * 0.12 + inset, y, width * 0.76 - inset * 2, height * 0.032);
    }
    ctx.strokeStyle = "rgba(255, 202, 137, .65)";
    ctx.lineWidth = Math.max(2, width * 0.004);
    for (let i = 0; i < 5; i += 1) {
      const x = width * (0.22 + i * 0.14);
      ctx.beginPath();
      ctx.moveTo(x, height * 0.3);
      ctx.lineTo(x, baseY - height * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, height * 0.3, width * 0.045, Math.PI, 0);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(43, 213, 231, .4)";
    ctx.beginPath();
    ctx.moveTo(width * 0.12, height * 0.26);
    ctx.lineTo(width * 0.88, height * 0.26);
    ctx.stroke();
  } else if (/ai|robot|technology|future|computer|digital|circuit|internet/.test(subject)) {
    const centerX = width * 0.5;
    const centerY = height * 0.43;
    const boxSize = width * 0.28;
    ctx.strokeStyle = "rgba(43, 213, 231, .58)";
    ctx.lineWidth = Math.max(2, width * 0.004);
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8 + elapsed * 0.08;
      const x = centerX + Math.cos(angle) * width * 0.31;
      const y = centerY + Math.sin(angle) * height * 0.19;
      const middleX = centerX + Math.cos(angle) * width * 0.2;
      const middleY = centerY + Math.sin(angle) * height * 0.12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(middleX, middleY);
      ctx.lineTo(centerX + Math.cos(angle) * boxSize * 0.6, centerY + Math.sin(angle) * boxSize * 0.6);
      ctx.stroke();
      ctx.fillStyle = "#F59B48";
      ctx.beginPath();
      ctx.arc(x, y, width * 0.009, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(18, 52, 76, .9)";
    ctx.strokeStyle = "#2bd5e7";
    ctx.lineWidth = Math.max(3, width * 0.006);
    ctx.beginPath();
    ctx.roundRect(centerX - boxSize / 2, centerY - boxSize / 2, boxSize, boxSize, width * 0.035);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e6fbff";
    ctx.font = "800 " + Math.round(width * 0.11) + "px Arial";
    ctx.textAlign = "center";
    ctx.fillText("AI", centerX, centerY + width * 0.04);
  } else {
    ctx.lineWidth = Math.max(2, width * 0.003);
    for (let wave = 0; wave < 4; wave += 1) {
      ctx.strokeStyle = wave % 2 ? "rgba(245, 155, 72, .53)" : "rgba(43, 213, 231, .55)";
      ctx.beginPath();
      for (let x = 0; x <= width; x += Math.max(4, width / 90)) {
        const y = height * (0.36 + wave * 0.055) + Math.sin(x / width * Math.PI * 5 + elapsed * (0.8 + wave * 0.14)) * height * (0.025 + wave * 0.004);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(43, 213, 231, .35)";
    ctx.lineWidth = Math.max(1, width * 0.002);
    for (let ring = 0; ring < 4; ring += 1) {
      const radius = width * (0.1 + ring * 0.07) + Math.sin(elapsed + ring) * width * 0.006;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.4, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawInHouseAtmosphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  elapsed: number,
  sceneIndex: number,
): void {
  const subject = (scene.visualPrompt + " " + scene.title + " " + scene.caption).toLowerCase();
  const warm = /fire|sun|desert|heat|volcano|lightning|temple|ancient/.test(subject);
  const cool = /ocean|water|rain|ice|space|planet|science|technology/.test(subject);
  const color = warm ? "245,155,72" : cool ? "43,213,231" : "139,177,208";

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 22; i += 1) {
    const seed = ((i * 191 + sceneIndex * 67) % 997) / 997;
    const speed = 0.006 + (i % 5) * 0.002;
    const x = ((seed + elapsed * speed) % 1) * width;
    const y = height * (0.12 + ((i * 61) % 997) / 997 * 0.72)
      + Math.sin(elapsed * (0.22 + (i % 4) * 0.08) + i) * height * 0.012;
    const radius = Math.max(2, width * (0.002 + (i % 3) * 0.001));
    ctx.globalAlpha = 0.12 + (i % 4) * 0.035;
    ctx.fillStyle = "rgba(" + color + ",1)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const sweepX = ((elapsed * width * 0.045) % (width * 1.5)) - width * 0.25;
  const sweep = ctx.createLinearGradient(sweepX - width * 0.08, 0, sweepX + width * 0.08, height);
  sweep.addColorStop(0, "rgba(" + color + ",0)");
  sweep.addColorStop(0.5, "rgba(" + color + ",0.075)");
  sweep.addColorStop(1, "rgba(" + color + ",0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  image: HTMLImageElement | undefined,
  video: HTMLVideoElement | undefined,
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

  if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight) * (1.025 + progress * 0.025);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    ctx.save();
    ctx.drawImage(video, (width - drawWidth) / 2 + drift, (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  } else if (image) {
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

  if (!video) drawSceneMotif(ctx, width, height, scene, elapsed);
  drawInHouseAtmosphere(ctx, width, height, scene, elapsed, sceneIndex);

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

  if (scene.videoClipAuthor) {
    ctx.fillStyle = "rgba(246,249,252,.72)";
    ctx.font = "500 " + Math.round(width * 0.016) + "px Arial";
    ctx.fillText("FOOTAGE: " + scene.videoClipAuthor + " · PIXABAY", width * 0.075, height * 0.94);
  }

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
  const unverifiedImages = project.scenes.filter((scene) => scene.imageDataUrl && !scene.imageCommercialUseConfirmed);
  if (unverifiedImages.length) throw new Error("Confirm image usage rights before exporting: " + unverifiedImages.map((scene) => scene.title).join(", ") + ".");
  const unverifiedVideo = project.scenes.filter((scene) =>
    (scene.videoDataUrl || (scene.videoClipSource === "pixabay" && scene.videoClipId)) && !scene.videoCommercialUseConfirmed,
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
  const width = vertical ? 720 : 1280;
  const height = vertical ? 1280 : 720;
  const fps = 24;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the video rendering canvas.");

  onProgress({ progress: 0.02, message: "Preparing in-house animated scenes…" });
  const images = new Map<string, HTMLImageElement>();
  const videos = new Map<string, HTMLVideoElement>();
  try {
    for (const scene of project.scenes) {
      if (scene.imageDataUrl) images.set(scene.id, await loadImage(scene.imageDataUrl));
      if (getSceneVideoSrc(scene)) videos.set(scene.id, await loadSceneVideo(scene));
    }
  } catch (error) {
    videos.forEach((video) => { video.pause(); video.removeAttribute("src"); video.load(); });
    throw error;
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
  let activeSceneId = "";
  let activeVideo: HTMLVideoElement | undefined;
  const renderStartedAt = performance.now();
  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const time = frame / fps;
      if (frame > 0) await waitUntil(renderStartedAt + time * 1000);
      const current = sceneAtTime(project.scenes, time);
      const nextVideo = videos.get(current.scene.id);
      if (activeSceneId !== current.scene.id) {
        activeVideo?.pause();
        activeVideo = nextVideo;
        activeSceneId = current.scene.id;
        if (activeVideo) {
          const clipStart = Math.max(0, current.scene.videoClipStart || 0);
          await seekVideo(activeVideo, clipStart);
          await activeVideo.play();
        }
      }
      if (activeVideo && activeVideo.paused) await activeVideo.play();
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
      );
      await videoSource.add(time, 1 / fps);
      if (frame % 12 === 0 || frame === totalFrames - 1) {
        onProgress({
          progress: 0.05 + 0.88 * ((frame + 1) / totalFrames),
          message: "Generating in-house motion video · frame " + (frame + 1) + " of " + totalFrames + "…",
        });
      }
    }
    activeVideo?.pause();
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
    onProgress({ progress: 1, message: "Your in-house video is ready." });
    return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    activeVideo?.pause();
    videoSource.close();
    audioSource?.close();
    throw error;
  } finally {
    videos.forEach((video) => { video.pause(); video.removeAttribute("src"); video.load(); });
  }
}