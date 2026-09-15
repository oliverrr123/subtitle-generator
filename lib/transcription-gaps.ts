import type { WordTiming } from "./captions";

export function findTranscriptionGaps(words: WordTiming[], duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  const sorted = words
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start)
    .sort((a, b) => a.start - b.start);

  for (const word of sorted) {
    const start = Math.min(duration, Math.max(0, word.start));
    if (start - cursor >= 4) gaps.push({ start: cursor, end: start });
    cursor = Math.min(duration, Math.max(cursor, word.end));
  }
  if (duration - cursor >= 4) gaps.push({ start: cursor, end: duration });
  return gaps;
}

export function offsetRecoveredWords(
  words: WordTiming[],
  range: { start: number; end: number },
) {
  return words
    .map((word) => ({
      word: word.word,
      start: Math.max(range.start, range.start + word.start),
      end: Math.min(range.end, range.start + word.end),
    }))
    .filter((word) => word.word.trim() && Number.isFinite(word.start) && Number.isFinite(word.end) && word.start < range.end && word.end >= word.start);
}
