import {
  AbsoluteFill,
  Html5Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { type CSSProperties } from "react";
import {
  fitSingleLineFontSize,
  getActiveCaption,
  type CaptionLine,
} from "../lib/captions";
import {
  defaultCaptionPresetId,
  isCaptionPresetId,
  type CaptionPresetId,
} from "../lib/caption-presets";

export type SubtitleVideoProps = {
  videoSrc: string;
  lines: CaptionLine[];
  durationInSeconds: number;
  width: number;
  height: number;
  exportFps: 24 | 30 | 60;
  showVideo?: boolean;
  transparentBackground?: boolean;
  style?: {
    preset?: CaptionPresetId;
    fontSizePercent: number;
    maxWidthPercent: number;
    bottomPercent?: number;
  };
};

type RenderPresetStyle = {
  container: CSSProperties;
  word: CSSProperties;
  activeWord: CSSProperties;
};

const crispOutline =
  "0.04em 0 #000, -0.04em 0 #000, 0 0.04em #000, 0 -0.04em #000, 0.03em 0.03em #000, -0.03em 0.03em #000, 0.03em -0.03em #000, -0.03em -0.03em #000, 0 0.08em 0.14em rgba(0,0,0,0.82)";

const heavyOutline =
  "0.055em 0 #000, -0.055em 0 #000, 0 0.055em #000, 0 -0.055em #000, 0.04em 0.04em #000, -0.04em 0.04em #000, 0.04em -0.04em #000, -0.04em -0.04em #000, 0 0.09em 0.12em rgba(0,0,0,0.88)";

const renderPresetStyles: Record<CaptionPresetId, RenderPresetStyle> = {
  "clean-pill": {
    container: {
      padding: "0.24em 0.4em 0.32em",
      borderRadius: "0.17em",
      background: "rgba(255, 255, 255, 0.97)",
      color: "#111",
      boxShadow: "0 8px 28px rgba(0,0,0,0.2)",
    },
    word: { color: "#9b9b9b" },
    activeWord: { color: "#111" },
  },
  "tiktok-pop": {
    container: {
      padding: "0.08em 0.12em",
      borderRadius: 0,
      background: "transparent",
      color: "#fff",
      textShadow: crispOutline,
    },
    word: { color: "#fff" },
    activeWord: { color: "#ffe500" },
  },
  "karaoke-yellow": {
    container: {
      padding: "0.06em 0.1em",
      borderRadius: 0,
      background: "transparent",
      color: "#fff",
      textShadow: heavyOutline,
    },
    word: { color: "#f7f7f7" },
    activeWord: { color: "#ffd21f" },
  },
  "meme-stroke": {
    container: {
      padding: "0.04em 0.1em",
      borderRadius: 0,
      background: "transparent",
      color: "#fff",
      textShadow: heavyOutline,
      textTransform: "uppercase",
    },
    word: { color: "rgba(255,255,255,0.8)" },
    activeWord: { color: "#fff" },
  },
  "creator-gradient": {
    container: {
      padding: "0.26em 0.48em 0.34em",
      borderRadius: "0.28em",
      background: "linear-gradient(135deg, #ff4ecd, #5f6cff 52%, #00d8ff)",
      color: "#fff",
      boxShadow: "0 12px 34px rgba(46,54,255,0.34)",
      textShadow: "0 0.06em 0.12em rgba(0,0,0,0.32)",
    },
    word: { color: "rgba(255,255,255,0.58)" },
    activeWord: { color: "#fff" },
  },
  "dark-bar": {
    container: {
      padding: "0.3em 0.58em 0.36em",
      borderRadius: "0.08em",
      background: "rgba(0,0,0,0.78)",
      color: "#fff",
      boxShadow: "0 10px 34px rgba(0,0,0,0.32)",
    },
    word: { color: "rgba(255,255,255,0.46)" },
    activeWord: { color: "#fff" },
  },
  "minimal-soft": {
    container: {
      padding: "0.1em 0.14em",
      borderRadius: 0,
      background: "transparent",
      color: "#fff",
      fontWeight: 760,
      textShadow: "0 0.08em 0.32em rgba(0,0,0,0.85)",
    },
    word: { color: "rgba(255,255,255,0.55)" },
    activeWord: { color: "#fff" },
  },
  bubblegum: {
    container: {
      padding: "0.26em 0.5em 0.34em",
      borderRadius: "999px",
      background: "#ff4fa3",
      color: "#fff",
      boxShadow: "0 10px 0 #9a1f62, 0 20px 34px rgba(0,0,0,0.25)",
      textShadow: "0 0.05em 0 rgba(119,0,63,0.32)",
    },
    word: { color: "rgba(255,255,255,0.56)" },
    activeWord: {
      color: "#161616",
      background: "#fff15c",
      borderRadius: "0.2em",
      padding: "0 0.1em 0.04em",
      margin: "0 -0.04em",
    },
  },
  "neon-glow": {
    container: {
      padding: "0.12em 0.16em",
      borderRadius: 0,
      background: "transparent",
      color: "#bdfdff",
      textShadow:
        "0 0 0.12em #00f0ff, 0 0 0.34em rgba(0,240,255,0.74), 0 0.08em 0.08em #001a1f",
    },
    word: { color: "rgba(189,253,255,0.42)" },
    activeWord: { color: "#fff" },
  },
  editorial: {
    container: {
      padding: "0.3em 0.5em 0.36em",
      borderRadius: "0.04em",
      background: "rgba(255,250,232,0.94)",
      color: "#1f1a14",
      border: "0.045em solid rgba(31,26,20,0.92)",
      boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
      fontFamily:
        "Georgia, Cambria, Times New Roman, Times, ui-serif, serif",
      fontWeight: 800,
    },
    word: { color: "rgba(31,26,20,0.42)" },
    activeWord: { color: "#1f1a14" },
  },
};

export function SubtitleVideo({
  videoSrc,
  lines,
  style,
  showVideo = true,
  transparentBackground = false,
}: SubtitleVideoProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const time = frame / fps;
  const activeCaption = getActiveCaption(lines, time);
  const presetId = isCaptionPresetId(style?.preset)
    ? style.preset
    : defaultCaptionPresetId;
  const presetStyle = renderPresetStyles[presetId];
  const maxWidth = width * ((style?.maxWidthPercent ?? 88) / 100);
  const requestedFontSize = width * ((style?.fontSizePercent ?? 5.5) / 100);
  const fontSize = activeCaption
    ? fitSingleLineFontSize(activeCaption.words, requestedFontSize, maxWidth)
    : requestedFontSize;
  const paddingBottom = height * ((style?.bottomPercent ?? 28) / 100);
  const scale = activeCaption
    ? interpolate(
        time,
        [activeCaption.start, activeCaption.start + 0.12],
        [0.97, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: transparentBackground ? "transparent" : "#111",
      }}
    >
      {showVideo && videoSrc ? (
        <Html5Video
          src={videoSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      ) : null}

      {activeCaption ? (
        <AbsoluteFill
          style={{
            boxSizing: "border-box",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom,
            paddingLeft: width * 0.07,
            paddingRight: width * 0.07,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              boxSizing: "border-box",
              flexWrap: "nowrap",
              justifyContent: "center",
              gap: "0.22em",
              maxWidth,
              whiteSpace: "nowrap",
              fontFamily:
                "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
              fontSize,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: 0,
              ...presetStyle.container,
              transform: `scale(${scale})`,
            }}
          >
            {activeCaption.words.map((word, index) => (
              <span
                key={`${word.word}-${index}`}
                style={{
                  display: "inline-block",
                  ...(time >= word.start
                    ? presetStyle.activeWord
                    : presetStyle.word),
                }}
              >
                {word.word}
              </span>
            ))}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
