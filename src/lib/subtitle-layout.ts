export interface SubtitleCue {
  text: string;
  start: number;
  end: number;
  index: number;
}

function wrapWords(text: string, maxCharactersPerLine: number): string[] {
  const words = text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (candidate.length > maxCharactersPerLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Builds short, two-line maximum caption cues with timings distributed by spoken word count. */
export function buildSubtitleCues(text: string, duration: number, maxCharactersPerLine = 38): SubtitleCue[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const limit = Math.max(18, Math.min(90, Math.floor(maxCharactersPerLine)));
  const lines = wrapWords(clean, limit);
  const captions: string[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    captions.push(lines.slice(index, index + 2).join("\n"));
  }
  const weights = captions.map((caption) => Math.max(1, caption.split(/\s+/).filter(Boolean).length));
  const totalWords = weights.reduce((sum, value) => sum + value, 0);
  const safeDuration = Math.max(0.1, Number.isFinite(duration) ? duration : 0.1);
  let cursor = 0;
  return captions.map((caption, index) => {
    const start = cursor;
    const end = index === captions.length - 1 ? safeDuration : cursor + safeDuration * weights[index] / totalWords;
    cursor = end;
    return { text: caption, start, end, index };
  });
}

export function getActiveSubtitleCue(cues: SubtitleCue[], elapsed: number): SubtitleCue | null {
  if (!cues.length) return null;
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  return cues.find((cue) => time < cue.end) ?? cues[cues.length - 1];
}
