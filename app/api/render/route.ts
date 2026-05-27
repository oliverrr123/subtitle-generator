import { mkdir } from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { z } from "zod";
import { type CaptionLine } from "@/lib/captions";
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
  lines: z.array(captionLineSchema),
  style: z
    .object({
      fontSizePercent: z.number().min(2).max(5.5),
      maxWidthPercent: z.number().min(38).max(88),
    })
    .optional(),
});

async function renderJob({
  jobId,
  outputPath,
  inputProps,
}: {
  jobId: string;
  outputPath: string;
  inputProps: RemotionInputProps;
}) {
  const job = renderJobs.get(jobId);
  if (!job) return;

  try {
    job.status = "rendering";
    job.progress = 1;

    const bundleLocation = await bundle({
      entryPoint: path.join(workspaceRoot, "remotion", "index.ts"),
      webpackOverride: (config) => {
        config.cache = false;
        return config;
      },
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "SubtitleVideo",
      inputProps,
    });

    let lastLoggedProgress = -1;

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      imageFormat: "jpeg",
      jpegQuality: 80,
      crf: 23,
      concurrency: "50%",
      chromiumOptions: {
        ignoreCertificateErrors: true,
      },
      onStart: ({ frameCount }) => {
        console.log("Starting render for " + jobId + ": " + frameCount + " frames");
      },
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        const percent = Math.floor(progress * 100);
        job.progress = Math.max(job.progress, percent);
        job.renderedFrames = renderedFrames;
        job.encodedFrames = encodedFrames;

        if (percent >= lastLoggedProgress + 5 || percent === 100) {
          lastLoggedProgress = percent;
          console.log(
            "Render " +
              jobId +
              ": " +
              percent +
              "% (" +
              renderedFrames +
              " rendered, " +
              encodedFrames +
              " encoded)",
          );
        }
      },
    });

    job.status = "done";
    job.progress = 100;
    job.url = "/renders/" + jobId + "/subtitled.mp4";
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
    const origin = new URL(request.url).origin;
    const videoUrl = origin + "/renders/" + jobId + "/" + path.basename(videoPath);
    const inputProps: RemotionInputProps = {
      videoSrc: videoUrl,
      lines: payload.lines,
      durationInSeconds: payload.durationInSeconds,
      style: payload.style,
    };

    renderJobs.set(jobId, {
      status: "queued",
      progress: 0,
      renderedFrames: 0,
      encodedFrames: 0,
    });

    void renderJob({ jobId, outputPath, inputProps });

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

type RemotionInputProps = {
  videoSrc: string;
  lines: CaptionLine[];
  durationInSeconds: number;
  style?: {
    fontSizePercent: number;
    maxWidthPercent: number;
  };
};
