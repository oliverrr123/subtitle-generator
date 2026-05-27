import { createReadStream } from "fs";
import path from "path";
import OpenAI from "openai";
import { groupWordsIntoLines, type WordTiming } from "@/lib/captions";
import { extractAudio } from "@/lib/ffmpeg";
import { createJobId, saveUpload, tmpRoot } from "@/lib/files";

export const runtime = "nodejs";
export const maxDuration = 300;

const retryableStatuses = new Set([429, 500, 502, 503, 504]);

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown) {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }

  return undefined;
}

async function transcribeWithRetry(openai: OpenAI, audioPath: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await openai.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
      });
    } catch (error) {
      lastError = error;
      const status = getErrorStatus(error);
      const shouldRetry = status ? retryableStatuses.has(status) : false;

      if (!shouldRetry || attempt === 3) {
        throw error;
      }

      console.warn(
        `Transcription failed with ${status}; retrying attempt ${attempt + 1}/3...`,
      );
      await wait(1500 * attempt * attempt);
    }
  }

  throw lastError;
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in .env.local." },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return Response.json({ error: "Upload a video file." }, { status: 400 });
    }

    const jobDir = path.join(tmpRoot, createJobId());
    const videoPath = await saveUpload(video, jobDir);
    const audioPath = path.join(jobDir, "audio.m4a");

    await extractAudio(videoPath, audioPath);

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 180000,
      maxRetries: 0,
    });

    const transcript = await transcribeWithRetry(openai, audioPath);

    const maybeWords = (
      transcript as unknown as {
        words?: Array<{ word?: string; start?: number; end?: number }>;
      }
    ).words;
    const rawWords = Array.isArray(maybeWords) ? maybeWords : [];

    const words: WordTiming[] = rawWords
      .map((word) => ({
        word: String(word.word ?? ""),
        start: Number(word.start ?? 0),
        end: Number(word.end ?? 0),
      }))
      .filter((word) => word.word.trim() && Number.isFinite(word.start));

    return Response.json({
      text: transcript.text,
      words,
      lines: groupWordsIntoLines(words),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not transcribe the video.",
      },
      { status: 500 },
    );
  }
}
