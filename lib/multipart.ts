type MultipartPart = {
  name: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
};

function getBoundary(contentType: string) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] ?? match?.[2]?.trim() ?? "";
}

function parseContentDisposition(value: string) {
  const name =
    value.match(/(?:^|;\s*)name="([^"]*)"/i)?.[1] ??
    value.match(/(?:^|;\s*)name=([^;]*)/i)?.[1]?.trim() ??
    "";
  const filename =
    value.match(/(?:^|;\s*)filename="([^"]*)"/i)?.[1] ??
    value.match(/(?:^|;\s*)filename=([^;]*)/i)?.[1]?.trim();

  return { name, filename };
}

function parseHeaders(headerText: string) {
  const headers = new Map<string, string>();

  for (const line of headerText.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    headers.set(
      line.slice(0, separatorIndex).trim().toLowerCase(),
      line.slice(separatorIndex + 1).trim(),
    );
  }

  return headers;
}

export async function parseMultipartRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const boundary = getBoundary(contentType);

  if (!boundary) {
    throw new Error("Missing multipart boundary.");
  }

  const bodyText = Buffer.from(await request.arrayBuffer()).toString("latin1");
  const segments = bodyText.split(`--${boundary}`);
  const parts = new Map<string, MultipartPart>();

  for (let segment of segments) {
    segment = segment.replace(/^\r?\n/, "");

    if (!segment || segment.startsWith("--")) {
      continue;
    }

    const headerMatch = segment.match(/\r?\n\r?\n/);
    if (!headerMatch?.index) continue;

    const headerEnd = headerMatch.index;
    const dataStart = headerEnd + headerMatch[0].length;
    const headers = parseHeaders(segment.slice(0, headerEnd));
    const disposition = headers.get("content-disposition") ?? "";
    const { name, filename } = parseContentDisposition(disposition);

    if (!name) continue;

    const dataText = segment.slice(dataStart).replace(/\r?\n$/, "");
    parts.set(name, {
      name,
      filename,
      contentType: headers.get("content-type"),
      data: Buffer.from(dataText, "latin1"),
    });
  }

  return parts;
}
