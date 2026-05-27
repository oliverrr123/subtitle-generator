import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
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

export async function saveUpload(file: File, directory: string) {
  await mkdir(directory, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(
    directory,
    `input${safeExtension(file.name, ".mp4")}`,
  );
  await writeFile(filePath, bytes);
  return filePath;
}
