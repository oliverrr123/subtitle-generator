import { spawn } from "child_process";
import { existsSync } from "fs";
import os from "os";
import ffmpegPath from "ffmpeg-static";

export function getFfmpegPath() {
  if (ffmpegPath && existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  const fallbackPaths = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];
  const fallbackPath = fallbackPaths.find((candidate) => existsSync(candidate));

  if (!fallbackPath) {
    throw new Error(
      "Could not find ffmpeg. Install it with Homebrew or rebuild ffmpeg-static.",
    );
  }

  return fallbackPath;
}

export async function extractAudio(videoPath: string, audioPath: string) {
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-movflags",
    "+faststart",
    audioPath,
  ]);
}

export async function transcodeVideoForRender(
  inputPath: string,
  outputPath: string,
  options?: { onProgress?: (seconds: number) => void },
) {
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ], options);
}

export async function burnSubtitlesIntoVideo({
  inputPath,
  subtitlePath,
  outputPath,
  fps,
  onProgress,
}: {
  inputPath: string;
  subtitlePath: string;
  outputPath: string;
  fps: number;
  onProgress?: (seconds: number) => void;
}) {
  const escapedSubtitlePath = subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:");
  const filter = `ass='${escapedSubtitlePath}'`;

  const baseArgs = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    filter,
    "-r",
    String(fps),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  if (os.platform() === "darwin") {
    try {
      await runFfmpeg(
        [
          ...baseArgs.slice(0, -1),
          "-c:v",
          "h264_videotoolbox",
          "-allow_sw",
          "1",
          "-b:v",
          "20M",
          "-maxrate",
          "28M",
          "-bufsize",
          "40M",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "160k",
          baseArgs[baseArgs.length - 1],
        ],
        { onProgress },
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`videotoolbox export failed, falling back to libx264: ${message}`);
    }
  }

  await runFfmpeg(
    [
      ...baseArgs.slice(0, -1),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      baseArgs[baseArgs.length - 1],
    ],
    { onProgress },
  );
}

export async function overlayImageSequenceOnVideo({
  inputPath,
  imageSequencePattern,
  firstFrameIndex,
  fps,
  outputPath,
  onProgress,
}: {
  inputPath: string;
  imageSequencePattern: string;
  firstFrameIndex: number;
  fps: number;
  outputPath: string;
  onProgress?: (seconds: number) => void;
}) {
  const filter = "[0:v][1:v]overlay=0:0:format=auto[v]";
  const baseArgs = [
    "-y",
    "-i",
    inputPath,
    "-framerate",
    String(fps),
    "-start_number",
    String(firstFrameIndex),
    "-i",
    imageSequencePattern,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    outputPath,
  ];

  if (os.platform() === "darwin") {
    try {
      await runFfmpeg(
        [
          ...baseArgs.slice(0, -1),
          "-c:v",
          "h264_videotoolbox",
          "-allow_sw",
          "1",
          "-b:v",
          "20M",
          "-maxrate",
          "28M",
          "-bufsize",
          "40M",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "160k",
          baseArgs[baseArgs.length - 1],
        ],
        { onProgress },
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`videotoolbox overlay export failed, falling back to libx264: ${message}`);
    }
  }

  await runFfmpeg(
    [
      ...baseArgs.slice(0, -1),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      baseArgs[baseArgs.length - 1],
    ],
    { onProgress },
  );
}

function runFfmpeg(
  args: string[],
  options?: { onProgress?: (seconds: number) => void },
) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;

      if (options?.onProgress) {
        const matches = text.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
        if (matches) {
          const [, hours, minutes, seconds] = matches;
          const totalSeconds =
            Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
          if (Number.isFinite(totalSeconds)) {
            options.onProgress(totalSeconds);
          }
        }
      }
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (stderr.includes("No space left on device")) {
        reject(
          new Error(
            "Not enough free disk space to prepare this video for rendering. Delete old renders/uploads or free disk space, then try again.",
          ),
        );
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}
