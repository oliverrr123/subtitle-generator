import { Composition } from "remotion";
import { SubtitleVideo } from "./subtitle-video";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="SubtitleVideo"
        component={SubtitleVideo}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: "",
          durationInSeconds: 10,
          width: 1280,
          height: 720,
          exportFps: 30,
          showVideo: true,
          transparentBackground: false,
          lines: [],
          style: {
            preset: "clean-pill",
            fontSizePercent: 6,
            maxWidthPercent: 88,
            bottomPercent: 28,
          },
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            Math.ceil(props.durationInSeconds * props.exportFps),
          ),
          fps: props.exportFps,
          width: props.width,
          height: props.height,
        })}
      />
      <Composition
        id="SubtitleOverlay"
        component={SubtitleVideo}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: "",
          durationInSeconds: 10,
          width: 1280,
          height: 720,
          exportFps: 30,
          showVideo: false,
          transparentBackground: true,
          lines: [],
          style: {
            preset: "clean-pill",
            fontSizePercent: 6,
            maxWidthPercent: 88,
            bottomPercent: 28,
          },
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            Math.ceil(props.durationInSeconds * props.exportFps),
          ),
          fps: props.exportFps,
          width: props.width,
          height: props.height,
        })}
      />
    </>
  );
}
