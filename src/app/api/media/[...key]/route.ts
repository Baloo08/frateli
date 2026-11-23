import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { openLocalFileStat, verifyMediaAccessToken } from "@/lib/storage";

function guessContentType(key: string): string {
  const ext = path.extname(key).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".vtt":
      return "text/vtt; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".csv":
      return "text/csv; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  const { key: keySegments } = await context.params;
  const key = keySegments.map(decodeURIComponent).join("/");
  const exp = Number(req.nextUrl.searchParams.get("exp") || "0");
  const sig = req.nextUrl.searchParams.get("sig") || "";

  if (!verifyMediaAccessToken(key, exp, sig)) {
    return NextResponse.json({ error: "Invalid or expired media token" }, { status: 403 });
  }

  try {
    const fileStat = await openLocalFileStat(key);
    const contentType = guessContentType(key);
    const range = req.headers.get("range");

    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
        if (start >= fileStat.size || start > end) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${fileStat.size}` },
          });
        }
        const chunkSize = end - start + 1;
        const stream = fileStat.createStream(start, end);
        return new NextResponse(stream as unknown as ReadableStream, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSize),
            "Content-Type": contentType,
          },
        });
      }
    }

    const stream = fileStat.createStream();
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Length": String(fileStat.size),
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
      },
    });
  } catch {
    return NextResponse.json({ error: "Media file not found" }, { status: 404 });
  }
}
