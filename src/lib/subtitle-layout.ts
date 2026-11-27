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

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+[”’"')]*|[^.!?]+$/g) ?? [text])
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitLongSentence(sentence: string, limit: number): string[] {
  if (wrapWords(sentence, limit).length <= 2) return [sentence];

  // Long sentences are split at spoken pause points before falling back to a
  // hard two-line split. This avoids ending ordinary captions mid-phrase.
  const clauses = sentence.match(/[^,;:—–]+(?:[,;:—–]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  if (clauses.length < 2) {
    const lines = wrapWords(sentence, limit);
    const chunks: string[] = [];
    for (let index = 0; index < lines.length; index += 2) {
      chunks.push(lines.slice(index, index + 2).join("\n"));
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current = "";
  for (const clause of clauses) {
    const candidate = current ? current + " " + clause : clause;
    if (current && wrapWords(candidate, limit).length > 2) {
      chunks.push(...splitLongSentence(current, limit));
      current = clause;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(...(wrapWords(current, limit).length > 2
    ? splitLongSentence(current, limit)
    : [current]));
  return chunks;
}

function buildCaptionChunks(text: string, limit: number): string[] {
  const chunks: string[] = [];
  for (const sentence of splitSentences(text)) {
    for (const part of splitLongSentence(sentence, limit)) {
      const lines = wrapWords(part, limit);
      const normalized = lines.join("\n");
      const previous = chunks[chunks.length - 1];
      if (previous && wrapWords(previous.replace(/\n/g, " ") + " " + part, limit).length <= 2) {
        chunks[chunks.length - 1] = wrapWords(previous.replace(/\n/g, " ") + " " + part, limit).join("\n");
      } else {
        chunks.push(normalized);
      }
    }
  }
  return chunks;
}

/**
 * Produces mobile-readable, two-line captions that prefer sentence and clause
 * boundaries. Timings are estimated from word count and punctuation pauses;
 * they are not word-level forced alignment to the generated voice track.
 */
export function buildSubtitleCues(text: string, duration: number, maxCharactersPerLine = 38): SubtitleCue[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const limit = Math.max(18, Math.min(90, Math.floor(maxCharactersPerLine)));
  const captions = buildCaptionChunks(clean, limit);
  const weights = captions.map((caption) => {
    const words = caption.split(/\s+/).filter(Boolean).length;
    const pauses = (caption.match(/[.!?]/g) ?? []).length * 1.25
      + (caption.match(/[,;:—–]/g) ?? []).length * 0.45;
    return Math.max(1, words + pauses);
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const safeDuration = Math.max(0.1, Number.isFinite(duration) ? duration : 0.1);
  let cursor = 0;
  return captions.map((caption, index) => {
    const start = cursor;
    const end = index === captions.length - 1
      ? safeDuration
      : cursor + safeDuration * weights[index] / totalWeight;
    cursor = end;
    return { text: caption, start, end, index };
  });
}

export function getActiveSubtitleCue(cues: SubtitleCue[], elapsed: number): SubtitleCue | null {
  if (!cues.length) return null;
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  return cues.find((cue) => time < cue.end) ?? cues[cues.length - 1];
}
