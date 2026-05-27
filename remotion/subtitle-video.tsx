import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { getActiveCaption, type CaptionLine } from "../lib/captions";

export type SubtitleVideoProps = {
  videoSrc: string;
  lines: CaptionLine[];
  durationInSeconds: number;
  style?: {
    fontSizePercent: number;
    maxWidthPercent: number;
  };
};

export function SubtitleVideo({ videoSrc, lines, style }: SubtitleVideoProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const time = frame / fps;
  const activeCaption = getActiveCaption(lines, time);
  const fontSize = width * ((style?.fontSizePercent ?? 3.2) / 100);
  const maxWidth = width * ((style?.maxWidthPercent ?? 66) / 100);
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
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {videoSrc ? (
        <OffthreadVideo
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
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: height * 0.12,
            paddingLeft: width * 0.07,
            paddingRight: width * 0.07,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.22em",
              maxWidth,
              padding: "0.24em 0.4em 0.32em",
              borderRadius: "0.17em",
              background: "rgba(255, 255, 255, 0.97)",
              color: "#111",
              fontFamily:
                "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
              fontSize,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: 0,
              boxShadow: "0 8px 28px rgba(0,0,0,0.2)",
              transform: `scale(${scale})`,
            }}
          >
            {activeCaption.words.map((word, index) => (
              <span
                key={`${word.word}-${index}`}
                style={{
                  color: time >= word.start ? "#111" : "#9b9b9b",
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
