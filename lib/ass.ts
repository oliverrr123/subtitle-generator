import { type CaptionLine } from "@/lib/captions";
import { defaultCaptionPresetId, type CaptionPresetId } from "@/lib/caption-presets";

type RenderStyle = {
  preset?: CaptionPresetId;
  fontSizePercent: number;
  maxWidthPercent: number;
  bottomPercent?: number;
};

type AssTheme = {
  fontName: string;
  activeColor: string;
  inactiveColor: string;
  outlineColor: string;
  backColor: string;
  borderStyle: 1 | 3;
  outline: number;
  shadow: number;
  bold: boolean;
  italic: boolean;
  uppercase?: boolean;
  boxPaddingScale?: number;
};

const assThemeByPreset: Record<CaptionPresetId, AssTheme> = {
  "clean-pill": {
    fontName: "Inter",
    activeColor: "#111111",
    inactiveColor: "#9b9b9b",
    outlineColor: "#ffffff",
    backColor: "#ffffff",
    borderStyle: 3,
    outline: 12,
    shadow: 0,
    bold: true,
    italic: false,
    boxPaddingScale: 0.22,
  },
  "tiktok-pop": {
    fontName: "Inter",
    activeColor: "#ffe500",
    inactiveColor: "#ffffff",
    outlineColor: "#000000",
    backColor: "#000000",
    borderStyle: 1,
    outline: 4,
    shadow: 0,
    bold: true,
    italic: false,
  },
  "karaoke-yellow": {
    fontName: "Inter",
    activeColor: "#ffd21f",
    inactiveColor: "#f7f7f7",
    outlineColor: "#000000",
    backColor: "#000000",
    borderStyle: 1,
    outline: 4,
    shadow: 0,
    bold: true,
    italic: false,
  },
  "meme-stroke": {
    fontName: "Inter",
    activeColor: "#ffffff",
    inactiveColor: "#d7d7d7",
    outlineColor: "#000000",
    backColor: "#000000",
    borderStyle: 1,
    outline: 5,
    shadow: 0,
    bold: true,
    italic: false,
    uppercase: true,
  },
  "creator-gradient": {
    fontName: "Inter",
    activeColor: "#ffffff",
    inactiveColor: "#d9e1ff",
    outlineColor: "#5f6cff",
    backColor: "#5f6cff",
    borderStyle: 3,
    outline: 10,
    shadow: 0,
    bold: true,
    italic: false,
    boxPaddingScale: 0.18,
  },
  "dark-bar": {
    fontName: "Inter",
    activeColor: "#ffffff",
    inactiveColor: "#b7b7b7",
    outlineColor: "#000000",
    backColor: "#000000",
    borderStyle: 3,
    outline: 12,
    shadow: 0,
    bold: true,
    italic: false,
    boxPaddingScale: 0.2,
  },
  "minimal-soft": {
    fontName: "Inter",
    activeColor: "#ffffff",
    inactiveColor: "#d1d1d1",
    outlineColor: "#000000",
    backColor: "#000000",
    borderStyle: 1,
    outline: 2,
    shadow: 1,
    bold: true,
    italic: false,
  },
  bubblegum: {
    fontName: "Inter",
    activeColor: "#161616",
    inactiveColor: "#fff4b5",
    outlineColor: "#ff4fa3",
    backColor: "#ff4fa3",
    borderStyle: 3,
    outline: 12,
    shadow: 0,
    bold: true,
    italic: false,
    boxPaddingScale: 0.22,
  },
  "neon-glow": {
    fontName: "Helvetica Neue",
    activeColor: "#ffffff",
    inactiveColor: "#ffffff",
    outlineColor: "#000000",
    backColor: "#000000",
    borderStyle: 1,
    outline: 1,
    shadow: 0,
    bold: true,
    italic: false,
  },
  editorial: {
    fontName: "Georgia",
    activeColor: "#1f1a14",
    inactiveColor: "#8c7e6f",
    outlineColor: "#fffae8",
    backColor: "#fffae8",
    borderStyle: 3,
    outline: 10,
    shadow: 0,
    bold: true,
    italic: false,
    boxPaddingScale: 0.18,
  },
};

function toAssColor(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => char + char)
        .join("")
    : normalized;
  const red = value.slice(0, 2);
  const green = value.slice(2, 4);
  const blue = value.slice(4, 6);
  return `&H00${blue}${green}${red}&`;
}

function escapeAssText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, " ");
}

function formatAssTime(seconds: number) {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const remaining = clamped - hours * 3600 - minutes * 60;
  const wholeSeconds = Math.floor(remaining);
  const centiseconds = Math.round((remaining - wholeSeconds) * 100);

  return [
    String(hours),
    String(minutes).padStart(2, "0"),
    String(wholeSeconds).padStart(2, "0"),
  ].join(":") + "." + String(centiseconds).padStart(2, "0");
}

function formatWord(text: string, theme: AssTheme, active: boolean) {
  const content = theme.uppercase ? text.toUpperCase() : text;
  if (active) {
    return `{\\c${toAssColor(theme.activeColor)}}${escapeAssText(content)}{\\r}`;
  }

  return escapeAssText(content);
}

function createDialogueText(line: CaptionLine, activeIndex: number, theme: AssTheme) {
  return line.words
    .map((word, index) => formatWord(word.word, theme, index === activeIndex))
    .join(" ");
}

export function createAssFromCaptionLines({
  lines,
  width,
  height,
  style,
}: {
  lines: CaptionLine[];
  width: number;
  height: number;
  style?: RenderStyle;
}) {
  const presetId = style?.preset ?? defaultCaptionPresetId;
  const theme = assThemeByPreset[presetId];
  const fontSize = Math.max(18, Math.round(width * ((style?.fontSizePercent ?? 6) / 100)));
  const maxWidth = width * ((style?.maxWidthPercent ?? 88) / 100);
  const sideMargin = Math.max(24, Math.round((width - maxWidth) / 2));
  const bottomMargin = Math.max(
    24,
    Math.round(height * ((style?.bottomPercent ?? 28) / 100)),
  );
  const outline =
    theme.borderStyle === 3 && theme.boxPaddingScale
      ? Math.max(theme.outline, Math.round(fontSize * theme.boxPaddingScale))
      : theme.outline;

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    [
      "Style: Default",
      theme.fontName,
      String(fontSize),
      toAssColor(theme.inactiveColor),
      toAssColor(theme.activeColor),
      toAssColor(theme.outlineColor),
      toAssColor(theme.backColor),
      theme.bold ? "-1" : "0",
      theme.italic ? "-1" : "0",
      "0",
      "0",
      "100",
      "100",
      "0",
      "0",
      String(theme.borderStyle),
      String(outline),
      String(theme.shadow),
      "2",
      String(sideMargin),
      String(sideMargin),
      String(bottomMargin),
      "1",
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];

  for (const line of lines) {
    for (let index = 0; index < line.words.length; index += 1) {
      const word = line.words[index];
      const nextWord = line.words[index + 1];
      const start = index === 0 ? line.start : word.start;
      const end = nextWord ? nextWord.start : line.end;

      events.push(
        [
          "Dialogue: 0",
          formatAssTime(start),
          formatAssTime(end),
          "Default",
          "",
          "0",
          "0",
          "0",
          "",
          createDialogueText(line, index, theme),
        ].join(","),
      );
    }
  }

  return [...header, ...events, ""].join("\n");
}
