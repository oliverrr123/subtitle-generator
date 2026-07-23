import { randomUUID } from "crypto";
import { access, mkdir, writeFile } from "fs/promises";
import path from "path";

export const workspaceRoot = process.cwd();
export const tmpRoot = path.join(workspaceRoot, "uploads");

export function safeExtension(fileName: string, fallback = ".mp4") {
  const ext = path.extname(fileName).toLowerCase();

  if (/^\.[a-z0-9]{2,6}$/.test(ext)) {
    return ext;
  }

  return fallback;
}

export function createJobId() {
  return `${Date.now()}-${randomUUID()}`;
}

export function uploadDirectory(uploadId: string) {
  return path.join(tmpRoot, uploadId);
}

export function uploadPath(uploadId: string, fileName: string) {
  return path.join(uploadDirectory(uploadId), `input${safeExtension(fileName, ".mp4")}`);
}

export function isSafeUploadId(uploadId: string) {
  return /^[0-9]+-[0-9a-f-]{36}$/i.test(uploadId);
}

export async function uploadedFileExists(uploadId: string, fileName: string) {
  if (!isSafeUploadId(uploadId)) return false;

  try {
    await access(uploadPath(uploadId, fileName));
    return true;
  } catch {
    return false;
  }
}

export async function saveUpload(file: File, directory: string) {
  await mkdir(directory, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  return saveUploadBytes(file.name, bytes, directory);
}

export async function saveUploadBytes(
  fileName: string,
  bytes: Buffer,
  directory: string,
) {
  await mkdir(directory, { recursive: true });
  const filePath = path.join(
    directory,
    `input${safeExtension(fileName, ".mp4")}`,
  );
  await writeFile(filePath, bytes);
  return filePath;
}
