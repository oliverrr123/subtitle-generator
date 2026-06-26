import { mkdir, rm } from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";
import { z } from "zod";
import { type CaptionLine } from "@/lib/captions";
import { captionPresetIds, type CaptionPresetId } from "@/lib/caption-presets";
import { overlayImageSequenceOnVideo } from "@/lib/ffmpeg";
import { createJobId, saveUpload, workspaceRoot } from "@/lib/files";

export const runtime = "nodejs";
export const maxDuration = 600;

type RenderJob = {
  status: "queued" | "rendering" | "done" | "error";
  progress: number;
  renderedFrames: number;
  encodedFrames: number;
  url?: string;
  error?: string;
  message?: string;
};

const globalForJobs = globalThis as typeof globalThis & {
  __subtitleRenderJobs?: Map<string, RenderJob>;
};

const renderJobs = globalForJobs.__subtitleRenderJobs ?? new Map<string, RenderJob>();
globalForJobs.__subtitleRenderJobs = renderJobs;

const wordTimingSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

const captionLineSchema = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  words: z.array(wordTimingSchema),
});

const renderPayloadSchema = z.object({
  durationInSeconds: z.number().positive().max(600),
  width: z.number().int().min(240).max(4096).optional(),
  height: z.number().int().min(240).max(4096).optional(),
  exportFps: z.union([z.literal(24), z.literal(30), z.literal(60)]).optional(),
  lines: z.array(captionLineSchema),
  style: z
    .object({
      preset: z.enum(captionPresetIds).optional(),
      fontSizePercent: z.number().min(2).max(5.5),
      maxWidthPercent: z.number().min(38).max(88),
      bottomPercent: z.number().min(4).max(42).optional(),
    })
    .optional(),
});

type RenderInputProps = {
  lines: CaptionLine[];
  durationInSeconds: number;
  width: number;
  height: number;
  exportFps: 24 | 30 | 60;
  style?: {
    preset?: CaptionPresetId;
    fontSizePercent: number;
    maxWidthPercent: number;
    bottomPercent?: number;
  };
};

async function renderJob({
  jobId,
  uploadedVideoPath,
  outputPath,
  overlayFramesDir,
  inputProps,
}: {
  jobId: string;
  uploadedVideoPath: string;
  outputPath: string;
  overlayFramesDir: string;
  inputProps: RenderInputProps;
}) {
  const job = renderJobs.get(jobId);
  if (!job) return;

  try {
    job.status = "rendering";
    job.progress = 1;
    job.message = "Rendering subtitle overlay...";

    const bundleLocation = await bundle({
      entryPoint: path.join(workspaceRoot, "remotion", "index.ts"),
      webpackOverride: (config) => {
        config.cache = false;
        return config;
      },
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "SubtitleOverlay",
      inputProps: {
        ...inputProps,
        videoSrc: "",
        showVideo: false,
        transparentBackground: true,
      },
    });

    const frames = await renderFrames({
      composition,
      serveUrl: bundleLocation,
      inputProps: {
        ...inputProps,
        videoSrc: "",
        showVideo: false,
        transparentBackground: true,
      },
      outputDir: overlayFramesDir,
      imageFormat: "png",
      concurrency: "100%",
      onStart: ({ frameCount }) => {
        job.encodedFrames = frameCount;
      },
      onFrameUpdate: (framesRendered) => {
        const progress = Math.min(
          85,
          Math.max(1, Math.floor((framesRendered / Math.max(1, composition.durationInFrames)) * 85)),
        );
        job.progress = progress;
        job.renderedFrames = framesRendered;
        job.message = "Rendering subtitle overlay...";
      },
    });

    job.message = "Compositing overlay onto video...";

    await overlayImageSequenceOnVideo({
      inputPath: uploadedVideoPath,
      imageSequencePattern: frames.assetsInfo.imageSequenceName,
      firstFrameIndex: frames.assetsInfo.firstFrameIndex,
      fps: inputProps.exportFps,
      outputPath,
      onProgress: (seconds) => {
        const duration = Math.max(0.001, inputProps.durationInSeconds);
        const progress = Math.min(99, Math.max(86, Math.floor((seconds / duration) * 14) + 85));
        const encodedFrames = Math.floor(seconds * inputProps.exportFps);
        job.progress = progress;
        job.encodedFrames = encodedFrames;
        job.message = "Compositing overlay onto video...";
      },
    });

    await rm(uploadedVideoPath, { force: true });
    await rm(overlayFramesDir, { recursive: true, force: true });

    job.status = "done";
    job.progress = 100;
    job.url = "/renders/" + jobId + "/subtitled.mp4";
    job.message = "Rendered video is ready.";
  } catch (error) {
    console.error(error);
    job.status = "error";
    job.error = error instanceof Error ? error.message : "Could not render the video.";
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");

  if (!jobId) {
    return Response.json({ error: "Missing jobId." }, { status: 400 });
  }

  const job = renderJobs.get(jobId);

  if (!job) {
    return Response.json({ error: "Render job not found." }, { status: 404 });
  }

  return Response.json({ jobId, ...job });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const video = formData.get("video");
    const payloadText = formData.get("payload");

    if (!(video instanceof File) || typeof payloadText !== "string") {
      return Response.json(
        { error: "Upload a video and caption payload." },
        { status: 400 },
      );
    }

    const payload = renderPayloadSchema.parse(JSON.parse(payloadText));
    const jobId = createJobId();
    const publicJobDir = path.join(workspaceRoot, "public", "renders", jobId);
    await mkdir(publicJobDir, { recursive: true });

    const videoPath = await saveUpload(video, publicJobDir);
    const outputPath = path.join(publicJobDir, "subtitled.mp4");
    const overlayFramesDir = path.join(publicJobDir, "overlay-frames");
    const inputProps: RenderInputProps = {
      lines: payload.lines,
      durationInSeconds: payload.durationInSeconds,
      width: payload.width ?? 1280,
      height: payload.height ?? 720,
      exportFps: payload.exportFps ?? 30,
      style: payload.style,
    };

    renderJobs.set(jobId, {
      status: "queued",
      progress: 0,
      renderedFrames: 0,
      encodedFrames: 0,
      message: "Queued render job...",
    });

    void renderJob({
      jobId,
      uploadedVideoPath: videoPath,
      outputPath,
      overlayFramesDir,
      inputProps,
    });

    return Response.json({
      jobId,
      status: "queued",
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not start rendering the video.",
      },
      { status: 500 },
    );
  }
}
