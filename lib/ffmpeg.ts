import { spawn } from "child_process";
import { existsSync } from "fs";
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

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}
