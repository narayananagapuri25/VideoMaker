import { useEffect, useMemo, useRef, useState } from "react";
import type { AspectRatio, Scene } from "../types";
import { getSceneAtTime, getSceneStartTime, getSceneTransitionProgress, getTimelineDuration } from "../lib/timeline";
import { getSceneVideoSrc } from "../lib/stock-video";
import { drawSceneFrame, type SceneTransition } from "../lib/scene-visuals";

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

function drawTimelineFrame(
  ctx: CanvasRenderingContext2D,
  scenes: Scene[],
  images: Map<string, HTMLImageElement>,
  videos: Map<string, HTMLVideoElement>,
  position: NonNullable<ReturnType<typeof getSceneAtTime>>,
  width: number,
  height: number,
  projectTime: number,
  totalDuration: number,
  isPlaying: boolean,
): void {
  const nextScene = scenes[position.index + 1];
  const progress = getSceneTransitionProgress(position, Boolean(nextScene));
  let transitionVideo: HTMLVideoElement | undefined;
  if (nextScene && progress > 0) {
    transitionVideo = videos.get(nextScene.id);
    if (transitionVideo && transitionVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const clipStart = Math.max(0, nextScene.videoClipStart || 0);
      if (Math.abs(transitionVideo.currentTime - clipStart) > 0.12 && transitionVideo.paused) {
        try { transitionVideo.currentTime = clipStart; } catch { /* wait for video metadata */ }
      }
      if (isPlaying && transitionVideo.paused) {
        void transitionVideo.play().catch(() => undefined);
      }
    } else if (transitionVideo) {
      transitionVideo = undefined;
    }
  }
  const transition: SceneTransition | undefined = nextScene && progress > 0
    ? {
        scene: nextScene,
        image: images.get(nextScene.id),
        video: transitionVideo,
        index: position.index + 1,
        progress,
      }
    : undefined;
  drawSceneFrame(
    ctx,
    width,
    height,
    position.scene,
    images.get(position.scene.id),
    videos.get(position.scene.id),
    position.offset,
    position.scene.duration,
    position.index,
    scenes.length,
    projectTime,
    totalDuration,
    transition,
  );
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
      video.onseeked = () => setImageVersion((version) => version + 1);
      video.onerror = () => onPlaybackError?.("The video clip for “" + scene.title + "” could not be loaded. The generated artwork remains available for this scene.");
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
      drawTimelineFrame(ctx, scenes, imagesRef.current, videosRef.current, position, width, height, playheadRef.current, totalDuration, isPlaying);
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
          drawTimelineFrame(ctx, scenes, imagesRef.current, videosRef.current, position, width, height, nextTime, totalDuration, true);
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
