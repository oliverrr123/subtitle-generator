export type WordTiming = {
  word: string;
  start: number;
  end: number;
};

export type CaptionLine = {
  id: string;
  start: number;
  end: number;
  words: WordTiming[];
};

export type CaptionSettings = {
  maxWordsPerLine: number;
  maxLineDuration: number;
  gapThreshold: number;
};

export const defaultCaptionSettings: CaptionSettings = {
  maxWordsPerLine: 3,
  maxLineDuration: 0.7,
  gapThreshold: 0.42,
};

export function cleanWord(word: string) {
  return word.trim().replace(/\s+/g, " ");
}

export function endsSentence(word: string) {
  return /[.!?…]["'”’\)\]]*$/.test(cleanWord(word));
}

export function estimateCaptionWidthEm(words: WordTiming[]) {
  const text = words.map((word) => word.word).join(" ");

  return Array.from(text).reduce((width, character) => {
    if (character === " ") return width + 0.28;
    if (/[ilI1'.,:;!|]/.test(character)) return width + 0.28;
    if (/[mwMW@%&]/.test(character)) return width + 0.9;
    if (/[A-Z0-9]/.test(character)) return width + 0.64;
    return width + 0.54;
  }, 0);
}

export function fitSingleLineFontSize(
  words: WordTiming[],
  requestedSize: number,
  maxWidth: number,
) {
  // Heavy caption fonts render a little wider than their nominal glyph metrics.
  // Keep a safety margin so one-line captions retain visible padding at both ends.
  const estimatedTextWidth = estimateCaptionWidthEm(words) * 1.14;
  const estimatedWidthWithPadding = estimatedTextWidth + 1.25;

  return Math.min(requestedSize, maxWidth / Math.max(estimatedWidthWithPadding, 1));
}

export function groupWordsIntoLines(
  inputWords: WordTiming[],
  settings: CaptionSettings = defaultCaptionSettings,
) {
  const words = inputWords
    .map((word) => ({
      ...word,
      word: cleanWord(word.word),
    }))
    .filter((word) => word.word.length > 0 && word.end >= word.start);

  const lines: CaptionLine[] = [];
  let current: WordTiming[] = [];

  const flush = () => {
    if (!current.length) {
      return;
    }

    lines.push({
      id: `caption-${lines.length}`,
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current,
    });
    current = [];
  };

  for (const word of words) {
    const previous = current[current.length - 1];
    const proposedStart = current[0]?.start ?? word.start;
    const proposedDuration = word.end - proposedStart;
    const gap = previous ? word.start - previous.end : 0;
    const shouldBreak =
      Boolean(previous && endsSentence(previous.word)) ||
      current.length >= settings.maxWordsPerLine ||
      proposedDuration > settings.maxLineDuration ||
      gap > settings.gapThreshold;

    if (shouldBreak) {
      flush();
    }

    current.push(word);
  }

  flush();
  return lines;
}

export function getActiveCaption(lines: CaptionLine[], time: number) {
  return (
    lines.find((line) => time >= line.start - 0.08 && time <= line.end + 0.24) ??
    null
  );
}
