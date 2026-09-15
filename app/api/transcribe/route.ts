import { createReadStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { groupWordsIntoLines, type WordTiming } from "@/lib/captions";
import { extractAudio } from "@/lib/ffmpeg";
import {
  createJobId,
  saveUploadBytes,
  tmpRoot,
  uploadedFileExists,
  uploadPath,
} from "@/lib/files";
import { parseMultipartRequest } from "@/lib/multipart";
import { normalizeTranscriptNumbers } from "@/lib/normalize-transcript";
import { findTranscriptionGaps, offsetRecoveredWords } from "@/lib/transcription-gaps";

export const runtime = "nodejs";
export const maxDuration = 300;

const retryableStatuses = new Set([429, 500, 502, 503, 504]);

type TimedTextLine = {
  id: string;
  start: number;
  end: number;
  text: string;
};

function decodeFileName(value: string | null) {
  if (!value) return "upload.mp4";

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function saveRequestVideo(request: Request, jobDir: string) {
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const isMultipart = contentType.toLowerCase().includes("multipart/form-data");

  if (isJson) {
    const body = (await request.json()) as {
      uploadId?: unknown;
      name?: unknown;
      dwigerMode?: unknown;
    };
    const uploadId = String(body.uploadId ?? "");
    const name = String(body.name ?? "upload.mp4");

    if (await uploadedFileExists(uploadId, name)) {
      return {
        videoPath: uploadPath(uploadId, name),
        dwigerMode: body.dwigerMode === true,
        error: null,
      };
    }

    return {
      videoPath: null,
      dwigerMode: false,
      error: "Uploaded video was not found. Select the video again.",
    };
  }

  if (!isMultipart) {
    const bytes = Buffer.from(await request.arrayBuffer());

    if (!bytes.length) {
      return {
        videoPath: null,
        dwigerMode: false,
        error: "Upload a video file.",
      };
    }

    return {
      videoPath: await saveUploadBytes(
        decodeFileName(request.headers.get("x-file-name")),
        bytes,
        jobDir,
      ),
      dwigerMode: request.headers.get("x-dwiger-mode") === "true",
      error: null,
    };
  }

  try {
    const parts = await parseMultipartRequest(request);
    const video = parts.get("video");

    if (!video) {
      return {
        videoPath: null,
        dwigerMode: false,
        error: "Upload a video file.",
      };
    }

    return {
      videoPath: await saveUploadBytes(video.filename ?? "upload.mp4", video.data, jobDir),
      dwigerMode: parts.get("dwigerMode")?.data.toString("utf8") === "true",
      error: null,
    };
  } catch {
    return {
      videoPath: null,
      dwigerMode: false,
      error:
        "Could not read the uploaded video. Try selecting the file again, or use a smaller MP4/MOV/WebM file.",
    };
  }
}

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

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(unfenced) as unknown;
}

function splitWords(text: string) {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function distributeWordsAcrossLine(line: TimedTextLine): WordTiming[] {
  const tokens = splitWords(line.text);
  if (!tokens.length) return [];

  const duration = Math.max(0.08, line.end - line.start);
  const step = duration / tokens.length;

  return tokens.map((word, index) => {
    const start = line.start + step * index;
    const end = index === tokens.length - 1 ? line.end : line.start + step * (index + 1);

    return {
      word,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    };
  });
}

async function translateLinesToNaturalCzech(
  openai: OpenAI,
  sourceLines: TimedTextLine[],
) {
  if (!sourceLines.length) return [];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.45,
    messages: [
      {
        role: "system",
        content:
          "You rewrite short-form video subtitles into natural Czech. Prioritize natural, idiomatic Czech over literal word-for-word meaning. Keep the tone casual and spoken when the source sounds casual. Keep subtitles concise and readable. Return only valid JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Translate/rewrite each timed subtitle chunk into natural Czech. Preserve the same ids. Do not include commentary.",
          outputShape: {
            lines: [{ id: "caption-0", text: "Přirozený český titulek" }],
          },
          lines: sourceLines.map((line) => ({
            id: line.id,
            text: line.text,
          })),
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message.content ?? "";
  const parsed = parseJsonObject(content);
  const translatedLines =
    typeof parsed === "object" &&
    parsed &&
    "lines" in parsed &&
    Array.isArray((parsed as { lines?: unknown }).lines)
      ? (parsed as { lines: Array<{ id?: unknown; text?: unknown }> }).lines
      : [];

  const translations = new Map(
    translatedLines
      .map((line) => [String(line.id ?? ""), String(line.text ?? "").trim()] as const)
      .filter(([id, text]) => id && text),
  );

  return sourceLines.map((line) => ({
    ...line,
    text: translations.get(line.id) ?? line.text,
  }));
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in .env.local." },
        { status: 500 },
      );
    }

    const jobDir = path.join(tmpRoot, createJobId());
    const { videoPath, dwigerMode, error } = await saveRequestVideo(request, jobDir);
    if (!videoPath) {
      return Response.json({ error }, { status: 400 });
    }

    const audioPath = path.join(jobDir, "audio.m4a");

    await mkdir(jobDir, { recursive: true });
    await extractAudio(videoPath, audioPath);

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 180000,
      maxRetries: 0,
    });

    const transcript = await transcribeWithRetry(openai, audioPath);

    // Whisper can omit a quiet speaker after a louder opening. Give long
    // uncaptioned sections their own pass, keeping their original timestamps.
    const gaps = findTranscriptionGaps(transcript.words ?? [], transcript.duration);
    const recoveredWords: WordTiming[] = [];
    for (const [index, gap] of gaps.entries()) {
      const gapPath = path.join(jobDir, `audio-gap-${index}.m4a`);
      if (!(await extractAudio(videoPath, gapPath, gap))) continue;
      const recovered = await transcribeWithRetry(openai, gapPath);
      recoveredWords.push(...offsetRecoveredWords(recovered.words ?? [], gap));
    }
    if (recoveredWords.length) {
      transcript.words = [...(transcript.words ?? []), ...recoveredWords]
        .sort((a, b) => a.start - b.start);
      transcript.text = transcript.words.map((word) => word.word).join(" ");
    }

    const maybeWords = (
      transcript as unknown as {
        words?: Array<{ word?: string; start?: number; end?: number }>;
      }
    ).words;
    const rawWords = Array.isArray(maybeWords) ? maybeWords : [];

    const words = normalizeTranscriptNumbers(
      rawWords
        .map((word) => ({
          word: String(word.word ?? ""),
          start: Number(word.start ?? 0),
          end: Number(word.end ?? 0),
        }))
        .filter((word) => word.word.trim() && Number.isFinite(word.start)),
      transcript.text,
    );

    if (!dwigerMode) {
      return Response.json({
        text: transcript.text,
        words,
        lines: groupWordsIntoLines(words),
        mode: "original",
      });
    }

    const sourceLines: TimedTextLine[] = groupWordsIntoLines(words).map((line) => ({
      id: line.id,
      start: line.start,
      end: line.end,
      text: line.words.map((word) => word.word).join(" "),
    }));
    const czechLines = await translateLinesToNaturalCzech(openai, sourceLines);
    const czechWords = czechLines.flatMap(distributeWordsAcrossLine);

    return Response.json({
      text: czechLines.map((line) => line.text).join(" "),
      words: czechWords,
      lines: groupWordsIntoLines(czechWords),
      mode: "dwiger",
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
