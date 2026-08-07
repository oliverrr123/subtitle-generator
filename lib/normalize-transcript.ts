import type { WordTiming } from "@/lib/captions";

const smallNumbers: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const scales: Record<string, number> = {
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

function bareToken(word: string) {
  return word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function trailingPunctuation(word: string) {
  return word.match(/[^a-z0-9]+$/i)?.[0] ?? "";
}

function readSpokenNumber(words: WordTiming[], start: number) {
  let total = 0;
  let current = 0;
  let end = start;
  let found = false;
  let previousWasSmall = false;
  let previousSmallValue = -1;
  let previousWasNumeric = false;

  for (let index = start; index < words.length; index += 1) {
    const token = bareToken(words[index].word);
    const numeric = token.replace(/,/g, "");

    if (/^\d+$/.test(numeric)) {
      if (found && !(previousWasNumeric && /^\d{3}$/.test(numeric))) break;
      current = previousWasNumeric
        ? Number(`${current}${numeric}`)
        : Number(numeric);
      found = true;
      previousWasSmall = false;
      previousSmallValue = -1;
      previousWasNumeric = true;
      end = index;
      continue;
    }

    const nextToken = bareToken(words[index + 1]?.word ?? "").replace(/,/g, "");
    if (
      token === "and" &&
      found &&
      (nextToken in smallNumbers || /^\d+$/.test(nextToken))
    ) {
      previousWasSmall = false;
      previousSmallValue = -1;
      previousWasNumeric = false;
      end = index;
      continue;
    }

    if (token in smallNumbers) {
      const value = smallNumbers[token];
      // Avoid turning separately spoken digit sequences such as "one two" into 3.
      if (previousWasSmall && previousSmallValue < 10 && value < 10) break;
      current += value;
      found = true;
      previousWasSmall = true;
      previousSmallValue = value;
      previousWasNumeric = false;
      end = index;
      continue;
    }

    if (token === "hundred" && found) {
      current = Math.max(current, 1) * 100;
      previousWasSmall = false;
      previousSmallValue = -1;
      previousWasNumeric = false;
      end = index;
      continue;
    }

    if (token in scales && found) {
      total += Math.max(current, 1) * scales[token];
      current = 0;
      previousWasSmall = false;
      previousSmallValue = -1;
      previousWasNumeric = false;
      end = index;
      continue;
    }

    break;
  }

  return found ? { value: total + current, end } : null;
}

type FormattingHint = { kind: "dollars" | "percent"; value: number };

function getFormattingHints(transcriptText: string): FormattingHint[] {
  const textWords = transcriptText
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({ word, start: index, end: index + 1 }));
  const normalizedText = normalizeTranscriptNumbers(textWords)
    .map((word) => word.word)
    .join(" ");
  const hints: FormattingHint[] = [];
  const pattern = /\$\s*([\d,]+)(?:\s+dollars?)?|([\d,]+)\s+dollars?\b|([\d,]+)\s*%/gi;

  for (const match of normalizedText.matchAll(pattern)) {
    const numeric = (match[1] ?? match[2] ?? match[3]).replace(/,/g, "");
    hints.push({
      kind: match[3] ? "percent" : "dollars",
      value: Number(numeric),
    });
  }

  return hints.filter((hint) => Number.isFinite(hint.value));
}

function restoreFormattingFromTranscript(
  words: WordTiming[],
  transcriptText: string,
) {
  const restored = words.map((word) => ({ ...word }));
  let searchStart = 0;

  for (const hint of getFormattingHints(transcriptText)) {
    for (let index = searchStart; index < restored.length; index += 1) {
      const numeric = restored[index].word.replace(/[^\d]/g, "");
      if (!numeric || Number(numeric) !== hint.value) continue;

      const formatted = new Intl.NumberFormat("en-US").format(hint.value);
      const punctuation = trailingPunctuation(restored[index].word);
      restored[index].word =
        hint.kind === "dollars"
          ? `$${formatted} dollars${punctuation}`
          : `${formatted}%${punctuation}`;
      searchStart = index + 1;
      break;
    }
  }

  return restored;
}

/** Converts spoken English quantities while retaining the full timing span. */
export function normalizeTranscriptNumbers(
  words: WordTiming[],
  transcriptText = "",
) {
  const normalized: WordTiming[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const parsed = readSpokenNumber(words, index);
    if (!parsed) {
      normalized.push(words[index]);
      continue;
    }

    let end = parsed.end;
    const unit = bareToken(words[end + 1]?.word ?? "");
    const formatted = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(parsed.value);
    let word = words[index].word.trim().startsWith("$") ? `$${formatted}` : formatted;

    if (unit === "percent" || unit === "percentage") {
      end += 1;
      word = `${formatted}%${trailingPunctuation(words[end].word)}`;
    } else if (unit === "dollar" || unit === "dollars") {
      end += 1;
      word = `$${formatted} ${unit}${trailingPunctuation(words[end].word)}`;
    } else {
      word += trailingPunctuation(words[end].word);
    }

    normalized.push({
      word,
      start: words[index].start,
      end: words[end].end,
    });
    index = end;
  }

  return transcriptText
    ? restoreFormattingFromTranscript(normalized, transcriptText)
    : normalized;
}
