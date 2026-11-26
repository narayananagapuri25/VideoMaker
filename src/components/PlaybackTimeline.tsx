import { useEffect, useMemo, useRef, useState } from "react";
import type { AspectRatio, Scene } from "../types";
import { getSceneAtTime, getSceneStartTime, getTimelineDuration } from "../lib/timeline";
import { getSceneVideoSrc } from "../lib/stock-video";

interface PlaybackTimelineProps {
  scenes: Scene[];
  aspectRatio: AspectRatio;
  voiceAudioDataUrl?: string;
  selectedSceneId: string;
  playhead: number;
  isPlaying: boolean;
  onSelectScene: (sceneId: string) => void;
  onPlayheadChange: (seconds: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onPlaybackError?: (message: string) => void;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Scene,
  image: HTMLImageElement | undefined,
  video: HTMLVideoElement | undefined,
  sceneElapsed: number,
  sceneDuration: number,
  index: number,
  projectElapsed: number,
  totalDuration: number,
) {
  const progress = Math.min(1, sceneElapsed / Math.max(0.1, sceneDuration));
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
    ctx.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  } else if (image) {
    const scale = Math.max(width / image.width, height / image.height) * (1.04 + progress * 0.045);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drift = Math.sin(sceneElapsed * 0.55) * width * 0.012;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(image, (width - drawWidth) / 2 + drift, (height - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.save();
    const prompt = (scene.visualPrompt + " " + scene.title + " " + scene.caption).toLowerCase();
    if (/lightning|thunder|storm|rain|bijli/.test(prompt)) {
      ctx.fillStyle = "rgba(18,36,58,.9)";
      for (let i = 0; i < 6; i += 1) {
        const x = width * (0.2 + i * 0.12);
        const y = height * 0.38 + Math.sin(sceneElapsed * 0.7 + i) * height * 0.008;
        ctx.beginPath();
        ctx.arc(x, y, width * (0.075 + (i % 2) * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowColor = "#F5B451";
      ctx.shadowBlur = width * 0.08;
      ctx.strokeStyle = "#F8C66B";
      ctx.lineWidth = width * 0.009;
      ctx.beginPath();
      ctx.moveTo(width * 0.56, height * 0.4);
      ctx.lineTo(width * 0.47, height * 0.54);
      ctx.lineTo(width * 0.55, height * 0.54);
      ctx.lineTo(width * 0.45, height * 0.69);
      ctx.stroke();
    } else if (/space|planet|black hole|moon|mars|galaxy|orbit|star/.test(prompt)) {
      ctx.fillStyle = "rgba(210,237,255,.72)";
      for (let i = 0; i < 40; i += 1) {
        const x = ((i * 97) % 997) / 997 * width;
        const y = ((i * 173) % 991) / 991 * height * 0.68;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, width * 0.002), 0, Math.PI * 2);
        ctx.fill();
      }
      const radius = width * 0.2;
      const x = width * 0.5 + Math.sin(sceneElapsed * 0.18) * width * 0.025;
      const y = height * 0.4;
      const planet = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.05, x, y, radius);
      planet.addColorStop(0, "#75e7ed");
      planet.addColorStop(0.5, "#247b9c");
      planet.addColorStop(1, "#111c4a");
      ctx.fillStyle = planet;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(245,155,72,.7)";
      ctx.lineWidth = width * 0.006;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.55, radius * 0.42, -0.24, 0, Math.PI * 2);
      ctx.stroke();
    } else if (/temple|ancient|history|stepwell|architecture|kingdom|historical/.test(prompt)) {
      ctx.fillStyle = "rgba(245,155,72,.2)";
      for (let level = 0; level < 6; level += 1) {
        const inset = level * width * 0.052;
        const y = height * 0.62 - level * height * 0.045;
        ctx.fillRect(width * 0.12 + inset, y, width * 0.76 - inset * 2, height * 0.032);
      }
      ctx.strokeStyle = "rgba(255,202,137,.68)";
      ctx.lineWidth = width * 0.004;
      for (let col = 0; col < 5; col += 1) {
        const x = width * (0.22 + col * 0.14);
        ctx.beginPath();
        ctx.moveTo(x, height * 0.3);
        ctx.lineTo(x, height * 0.58);
        ctx.arc(x, height * 0.3, width * 0.045, Math.PI, 0);
        ctx.stroke();
      }
    } else {
      for (let wave = 0; wave < 5; wave += 1) {
        ctx.strokeStyle = wave % 2 ? "rgba(245,155,72,.42)" : "rgba(43,213,231,.48)";
        ctx.lineWidth = Math.max(2, width * 0.003);
        ctx.beginPath();
        for (let x = 0; x <= width; x += Math.max(5, width / 80)) {
          const y = height * (0.34 + wave * 0.055) + Math.sin(x / width * Math.PI * 5 + sceneElapsed * (0.7 + wave * 0.13)) * height * 0.026;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(3,9,18,.52)");
  overlay.addColorStop(0.35, "rgba(3,9,18,.08)");
  overlay.addColorStop(0.55, "rgba(3,9,18,.42)");
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
  if (scene.videoClipAuthor) {
    ctx.fillStyle = "rgba(246,249,252,.72)";
    ctx.font = "500 " + Math.round(width * 0.016) + "px Arial";
    ctx.fillText("FOOTAGE: " + scene.videoClipAuthor + " · PIXABAY", width * 0.075, height * 0.94);
  }

  ctx.fillStyle = "#20D9EC";
  ctx.font = "700 " + Math.round(width * 0.031) + "px Arial";
  ctx.fillText("CHAPTER " + String(index + 1).padStart(2, "0"), width * 0.075, height * 0.69);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 " + Math.round(width * 0.068) + "px Arial";
  wrapCanvasText(ctx, scene.title.toUpperCase(), width * 0.84).slice(0, 2)
    .forEach((line, lineIndex) => ctx.fillText(line, width * 0.075, height * 0.75 + lineIndex * height * 0.075));

  ctx.fillStyle = "rgba(246,249,252,.9)";
  ctx.font = "500 " + Math.round(width * 0.032) + "px Arial";
  wrapCanvasText(ctx, scene.caption || scene.narration, width * 0.84).slice(0, 3)
    .forEach((line, lineIndex) => ctx.fillText(line, width * 0.075, height * 0.88 + lineIndex * height * 0.042));

  const barY = height * 0.965;
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(width * 0.075, barY, width * 0.85, Math.max(3, height * 0.004));
  ctx.fillStyle = "#F59B48";
  ctx.fillRect(width * 0.075, barY, width * 0.85 * (projectElapsed / Math.max(0.1, totalDuration)), Math.max(3, height * 0.004));
}

export default function PlaybackTimeline({
  scenes,
  aspectRatio,
  voiceAudioDataUrl,
  selectedSceneId,
  playhead,
  isPlaying,
  onSelectScene,
  onPlayheadChange,
  onPlayingChange,
  onPlaybackError,
}: PlaybackTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [imageVersion, setImageVersion] = useState(0);
  const playheadRef = useRef(playhead);
  const selectedRef = useRef(selectedSceneId);
  const rafRef = useRef<number | null>(null);
  const lastStateUpdateRef = useRef(0);
  const totalDuration = useMemo(() => getTimelineDuration(scenes), [scenes]);
  const vertical = aspectRatio === "9:16";
  const width = vertical ? 720 : 1280;
  const height = vertical ? 1280 : 720;
  const activePosition = getSceneAtTime(scenes, playhead);
  const activeScene = activePosition?.scene ?? scenes[0];

  useEffect(() => { playheadRef.current = playhead; }, [playhead]);
  useEffect(() => { selectedRef.current = selectedSceneId; }, [selectedSceneId]);

  useEffect(() => {
    const next = new Map<string, HTMLImageElement>();
    imagesRef.current = next;
    for (const scene of scenes) {
      if (!scene.imageDataUrl) continue;
      const image = new Image();
      image.onload = () => { next.set(scene.id, image); imagesRef.current = new Map(next); setImageVersion((version) => version + 1); };
      image.src = scene.imageDataUrl;
    }
    imagesRef.current = next;
  }, [scenes]);

  useEffect(() => {
    const next = new Map<string, HTMLVideoElement>();
    videosRef.current = next;
    for (const scene of scenes) {
      const source = getSceneVideoSrc(scene, "small");
      if (!source) continue;
      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.onloadeddata = () => setImageVersion((version) => version + 1);
      video.onerror = () => onPlaybackError?.("The video clip for “" + scene.title + "” could not be loaded. Check the Pixabay service or replace the clip.");
      video.src = source;
      video.load();
      next.set(scene.id, video);
    }
    return () => {
      next.forEach((video) => { video.pause(); video.removeAttribute("src"); video.load(); });
      videosRef.current = new Map();
    };
  }, [scenes, onPlaybackError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const position = getSceneAtTime(scenes, playheadRef.current);
    if (position) {
      const video = videosRef.current.get(position.scene.id);
      if (!isPlaying && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.pause();
        const start = Math.max(0, position.scene.videoClipStart || 0);
        const target = Math.min(start + position.offset, Math.max(0, video.duration - 0.05));
        if (Math.abs(video.currentTime - target) > 0.1) {
          try { video.currentTime = target; } catch { /* video metadata may still be loading */ }
        }
      }
      drawFrame(ctx, width, height, position.scene, imagesRef.current.get(position.scene.id), video, position.offset, position.scene.duration, position.index, playheadRef.current, totalDuration);
    }
  }, [width, height, scenes, playhead, totalDuration, imageVersion, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.pause();
      videosRef.current.forEach((video) => video.pause());
      return;
    }

    const startedAt = performance.now();
    const startPlayhead = playheadRef.current;
    const audio = audioRef.current;
    if (audio && voiceAudioDataUrl) {
      try {
        audio.currentTime = Math.min(startPlayhead, Number.isFinite(audio.duration) ? audio.duration : startPlayhead);
        void audio.play().catch(() => onPlaybackError?.("Narration could not autoplay. Use the audio controls or try again."));
      } catch {
        onPlaybackError?.("The narration audio could not be started.");
      }
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    let lastSelected = "";
    let lastVideoSceneId = "";
    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const wallClockTime = startPlayhead + elapsed;
      const audioClockTime = audio && !audio.paused && !audio.ended ? audio.currentTime : wallClockTime;
      // Let narration drive preview timing while it is playing to minimise drift.
      // Continue the visual timeline on the monotonic clock after a shorter track ends.
      const nextTime = Math.min(totalDuration, Math.max(playheadRef.current, audioClockTime));
      const position = getSceneAtTime(scenes, nextTime);
      if (position) {
        const activeVideo = videosRef.current.get(position.scene.id);
        if (activeVideo && activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (lastVideoSceneId !== position.scene.id) {
            videosRef.current.forEach((video) => { if (video !== activeVideo) video.pause(); });
            lastVideoSceneId = position.scene.id;
            const start = Math.max(0, position.scene.videoClipStart || 0);
            try { activeVideo.currentTime = Math.min(start + position.offset, Math.max(0, activeVideo.duration - 0.05)); } catch { /* wait for the browser decoder */ }
          }
          if (activeVideo.paused) void activeVideo.play().catch(() => onPlaybackError?.("This browser could not play the selected scene clip. Try importing a local MP4."));
        }
        if (ctx) {
          drawFrame(ctx, width, height, position.scene, imagesRef.current.get(position.scene.id), activeVideo, position.offset, position.scene.duration, position.index, nextTime, totalDuration);
        }
        if (position.scene.id !== lastSelected) {
          lastSelected = position.scene.id;
          if (selectedRef.current !== lastSelected) {
            selectedRef.current = lastSelected;
            onSelectScene(lastSelected);
          }
        }
      }
      playheadRef.current = nextTime;
      if (now - lastStateUpdateRef.current > 90 || nextTime >= totalDuration) {
        lastStateUpdateRef.current = now;
        onPlayheadChange(nextTime);
      }
      if (nextTime >= totalDuration) {
        rafRef.current = null;
        onPlayingChange(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audio?.pause();
      videosRef.current.forEach((video) => video.pause());
    };
  }, [isPlaying, scenes, totalDuration, width, height, voiceAudioDataUrl, onPlaybackError, onPlayheadChange, onPlayingChange, onSelectScene]);

  function seekTo(seconds: number) {
    const next = Math.max(0, Math.min(totalDuration, seconds));
    playheadRef.current = next;
    onPlayheadChange(next);
    const position = getSceneAtTime(scenes, next);
    if (position) onSelectScene(position.scene.id);
    if (audioRef.current && voiceAudioDataUrl) {
      try { audioRef.current.currentTime = Math.min(next, Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : next); } catch { /* metadata may not be loaded yet */ }
    }
  }

  function selectScene(sceneId: string) {
    onSelectScene(sceneId);
    seekTo(getSceneStartTime(scenes, sceneId));
  }

  return (
    <div className="timeline-player">
      {voiceAudioDataUrl && <audio ref={audioRef} src={voiceAudioDataUrl} preload="metadata" onError={() => onPlaybackError?.("The narration file could not be decoded by this browser.")} />}
      <div className={"preview-stage canvas-stage " + (vertical ? "" : "landscape")}>
        <canvas ref={canvasRef} aria-label="Animated video preview" />
        <div className="preview-watermark">LIVE PREVIEW</div>
      </div>
      <div className="timeline-controls">
        <button className="button button-primary timeline-play" onClick={() => {
          if (isPlaying) onPlayingChange(false);
          else {
            if (playhead >= totalDuration - 0.05) seekTo(0);
            onPlayingChange(true);
          }
        }} disabled={!scenes.length}>{isPlaying ? "Ⅱ Pause" : "▶ Play"}</button>
        <button className="button button-quiet timeline-reset" onClick={() => { onPlayingChange(false); seekTo(0); }}>↺</button>
        <div className="timeline-time"><strong>{formatTime(playhead)}</strong><span>/ {formatTime(totalDuration)}</span></div>
      </div>
      <input className="timeline-scrubber" aria-label="Scrub video timeline" type="range" min="0" max={Math.max(0.1, totalDuration)} step="0.05" value={Math.min(playhead, totalDuration)} onChange={(event) => { onPlayingChange(false); seekTo(Number(event.target.value)); }} />
      <div className="timeline-ruler" aria-label="Scene timeline">
        {scenes.map((scene, index) => {
          const widthPercent = Math.max(4, (scene.duration / Math.max(0.1, totalDuration)) * 100);
          const isActive = scene.id === activeScene?.id;
          return (
            <button
              key={scene.id}
              className={"timeline-segment " + (isActive ? "active" : "")}
              style={{ flexBasis: widthPercent + "%", flexGrow: scene.duration, flexShrink: 1 }}
              title={scene.title + " · " + formatTime(scene.duration)}
              onClick={() => { onPlayingChange(false); selectScene(scene.id); }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{scene.title}</strong>
              <small>{formatTime(scene.duration)}</small>
            </button>
          );
        })}
      </div>
      <div className="timeline-footnote">{activeScene ? "Now previewing: " + activeScene.title : "Add a scene to start previewing"} · Editing a scene updates the preview automatically.</div>
    </div>
  );
}
