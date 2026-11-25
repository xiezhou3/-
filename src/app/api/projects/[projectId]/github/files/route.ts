import { apiErrorResponse } from "@/lib/api-error";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  GITHUB_CONTENTS_MAX_BYTES,
  uploadGitHubFile,
} from "@/lib/github-repository";
import { getProjectRepository } from "@/lib/project-repository-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { projectId } = await params;
    const repository = await getProjectRepository(session.user.id, projectId);
    if (!repository) throw new AppError("尚未连接 GitHub 仓库");
    if (!repository.canManage) {
      throw new ForbiddenError("仅团队管理员可以上传到 GitHub 仓库");
    }

    const formData = await request.formData();
    const branch = String(formData.get("branch") || repository.defaultBranch);
    const folder = sanitizeFolder(String(formData.get("folder") || ""));
    const message =
      String(formData.get("message") || "").trim() ||
      `Upload files from AgileCampus (${new Date().toISOString()})`;
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length === 0) throw new AppError("请选择要上传的文件");
    if (files.length > 20) throw new AppError("单次最多上传 20 个文件");

    const uploaded = [];
    for (const file of files) {
      if (file.size > GITHUB_CONTENTS_MAX_BYTES) {
        throw new AppError(`${file.name} 超过 GitHub 单文件 20 MB 限制`, 413);
      }
      const filename = sanitizeFilename(file.name);
      const path = folder ? `${folder}/${filename}` : filename;
      const data = Buffer.from(await file.arrayBuffer());
      const result = await uploadGitHubFile(
        repository.owner,
        repository.name,
        path,
        data,
        { branch, message },
      );
      uploaded.push(result);
    }

    return Response.json({ uploaded }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function sanitizeFolder(value: string) {
  const folder = value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!folder) return "";
  if (folder.split("/").some((segment) => segment === "..")) {
    throw new AppError("目标目录无效");
  }
  return folder;
}

function sanitizeFilename(value: string) {
  const filename = value.trim().split(/[\\/]/).pop()?.trim();
  if (!filename || filename === "." || filename === "..") {
    throw new AppError("文件名无效");
  }
  return filename;
}
