import { Readable } from "node:stream";
import rangeParser from "range-parser";
import { auth } from "@/lib/auth";
import {
  getProjectFileAccess,
  writeProjectFileUpload,
} from "@/lib/project-file-service";
import { getFileStorage } from "@/lib/file-storage";
import { AppError } from "@/lib/errors";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  if (!request.body) {
    return Response.json({ error: "请求中缺少文件内容" }, { status: 400 });
  }

  try {
    const { fileId } = await params;
    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : undefined;
    const stream = Readable.fromWeb(
      request.body as import("node:stream/web").ReadableStream<Uint8Array>,
    );
    const file = await writeProjectFileUpload(
      session.user.id,
      fileId,
      stream,
      contentLength,
    );
    return Response.json({ id: file.id, status: file.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { fileId } = await params;
    const access = await getProjectFileAccess(session.user.id, fileId);
    const { file } = access;

    if (file.source === "link") {
      if (!file.externalUrl) throw new AppError("链接文件不存在");
      return Response.redirect(file.externalUrl, 302);
    }
    if (file.status !== "ready" || !file.storageKey) {
      throw new AppError("文件尚未上传完成");
    }

    const storage = getFileStorage();
    const { sizeBytes } = await storage.stat(file.storageKey);
    const rangeHeader = request.headers.get("range");
    const parsedRange = rangeHeader
      ? rangeParser(sizeBytes, rangeHeader, { combine: true })
      : undefined;
    if (parsedRange === -1 || parsedRange === -2) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${sizeBytes}` },
      });
    }

    const range = Array.isArray(parsedRange) ? parsedRange[0] : undefined;
    const start = range?.start ?? 0;
    const end = range?.end ?? sizeBytes - 1;
    const stream = storage.createReadStream(file.storageKey, { start, end });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    const encodedName = encodeURIComponent(file.name);
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0, must-revalidate",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(end - start + 1),
      "Content-Type": file.mimeType || "application/octet-stream",
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${sizeBytes}`;

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
