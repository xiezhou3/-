import { Readable } from "node:stream";
import rangeParser from "range-parser";
import { auth } from "@/lib/auth";
import { getProjectFileAccess } from "@/lib/project-file-service";
import { getFileStorage } from "@/lib/file-storage";
import { AppError } from "@/lib/errors";
import {
  ensureOfficePdfPreview,
  isOfficePreviewFile,
} from "@/lib/office-preview";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { fileId } = await params;
    const { file } = await getProjectFileAccess(session.user.id, fileId);
    if (file.source !== "upload" || file.status !== "ready") {
      throw new AppError("文件尚未上传完成");
    }
    if (!isOfficePreviewFile(file)) {
      throw new AppError("该文件不需要 Office 转换");
    }
    await ensureOfficePdfPreview(file);
    return Response.json({
      ready: true,
      url: `/api/project-files/${fileId}/preview`,
    });
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
    const { file } = await getProjectFileAccess(session.user.id, fileId);
    if (file.source !== "upload" || file.status !== "ready") {
      throw new AppError("文件尚未上传完成");
    }
    if (!isOfficePreviewFile(file)) {
      throw new AppError("该文件不需要 Office 转换");
    }

    const previewKey = await ensureOfficePdfPreview(file);
    const storage = getFileStorage();
    const { sizeBytes } = await storage.stat(previewKey);
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
    const stream = storage.createReadStream(previewKey, { start, end });
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0, must-revalidate",
      "Content-Disposition": "inline",
      "Content-Length": String(end - start + 1),
      "Content-Type": "application/pdf",
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
