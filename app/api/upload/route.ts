import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import {
  createJobId,
  safeExtension,
  uploadDirectory,
  uploadPath,
} from "@/lib/files";

export const runtime = "nodejs";
export const maxDuration = 600;

function decodeFileName(value: string | null) {
  if (!value) return "upload.mp4";

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function POST(request: Request) {
  try {
    if (!request.body) {
      return Response.json({ error: "Upload a video file." }, { status: 400 });
    }

    const uploadId = createJobId();
    const fileName = decodeFileName(request.headers.get("x-file-name"));
    const contentType =
      request.headers.get("content-type") || "application/octet-stream";
    const size = Number(request.headers.get("content-length") ?? 0);
    const directory = uploadDirectory(uploadId);
    const filePath = uploadPath(uploadId, fileName);

    await mkdir(directory, { recursive: true });
    await pipeline(
      Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(filePath),
    );

    return Response.json({
      uploadId,
      name: fileName,
      type: contentType,
      size,
      extension: safeExtension(fileName, ".mp4"),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not upload the video.",
      },
      { status: 500 },
    );
  }
}
