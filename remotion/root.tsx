import { Composition } from "remotion";
import { SubtitleVideo } from "./subtitle-video";

export function RemotionRoot() {
  return (
    <Composition
      id="SubtitleVideo"
      component={SubtitleVideo}
      durationInFrames={300}
      fps={24}
      width={1280}
      height={720}
      defaultProps={{
        videoSrc: "",
        durationInSeconds: 10,
        lines: [],
        style: {
          fontSizePercent: 3.2,
          maxWidthPercent: 66,
        },
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.ceil(props.durationInSeconds * 24)),
        fps: 24,
        width: 1280,
        height: 720,
      })}
    />
  );
}
