import type { Scene } from "../types";

export interface ScenePosition {
  scene: Scene;
  index: number;
  start: number;
  end: number;
  offset: number;
}

export function getTimelineDuration(scenes: Scene[]): number {
  return scenes.reduce((total, scene) => total + Math.max(0.1, Number(scene.duration) || 0.1), 0);
}

export function getSceneAtTime(scenes: Scene[], requestedTime: number): ScenePosition | null {
  if (!scenes.length) return null;
  const total = getTimelineDuration(scenes);
  const time = Math.min(Math.max(0, requestedTime), Math.max(0, total - 0.001));
  let start = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const end = start + Math.max(0.1, Number(scene.duration) || 0.1);
    if (time < end || index === scenes.length - 1) {
      return { scene, index, start, end, offset: Math.max(0, time - start) };
    }
    start = end;
  }
  return null;
}

export function getSceneStartTime(scenes: Scene[], sceneId: string): number {
  let start = 0;
  for (const scene of scenes) {
    if (scene.id === sceneId) return start;
    start += Math.max(0.1, Number(scene.duration) || 0.1);
  }
  return 0;
}

export function clampPlayhead(scenes: Scene[], requestedTime: number): number {
  const duration = getTimelineDuration(scenes);
  return Math.min(Math.max(0, Number.isFinite(requestedTime) ? requestedTime : 0), duration);
}
