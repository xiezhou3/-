import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { projectFiles, users } from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import {
  getFileStorage,
  getMaxFileSizeBytes,
  safeFilename,
  type StorageWriteResult,
} from "./file-storage";
import { getProjectForUser } from "./project";
import {
  cleanupOfficePreviewTemporaryFiles,
  deleteOfficePdfPreview,
} from "./office-preview";
import {
  inferPrimaryLanguage,
  isAllowedProjectFile,
  resolveProjectFileKind,
  summarizeProjectFiles,
  type ProjectCodeMeta,
  type ProjectFile,
  type ProjectFileKind,
  type ProjectFileSummary,
  type StoredProjectFile,
} from "./project-files";

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export type ProjectFileAccess = {
  file: typeof projectFiles.$inferSelect;
  role: "admin" | "teacher" | "student";
};

async function requireProjectMembership(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return access;
}

export async function listProjectFiles(
  actorId: string,
  projectId: string,
): Promise<StoredProjectFile[]> {
  const access = await requireProjectMembership(actorId, projectId);
  await cleanupStaleProjectFileUploads().catch((error) => {
    console.error("[project-files] 清理过期上传失败", error);
  });

  const rows = await db
    .select({
      id: projectFiles.id,
      name: projectFiles.name,
      kind: projectFiles.kind,
      source: projectFiles.source,
      sizeBytes: projectFiles.sizeBytes,
      externalUrl: projectFiles.externalUrl,
      status: projectFiles.status,
      mimeType: projectFiles.mimeType,
      codeMeta: projectFiles.codeMeta,
      createdById: projectFiles.createdById,
      owner: users.name,
      updatedAt: projectFiles.updatedAt,
    })
    .from(projectFiles)
    .leftJoin(users, eq(projectFiles.createdById, users.id))
    .where(
      and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.status, "ready"),
        isNull(projectFiles.deletedAt),
      ),
    )
    .orderBy(desc(projectFiles.updatedAt));

  return rows.map((row) =>
    mapStoredProjectFile(row, actorId, access.role),
  );
}

export async function listProjectFileSummaries(projectIds: string[]) {
  const summaries = new Map<string, ProjectFileSummary>();
  if (projectIds.length === 0) return summaries;

  const rows = await db
    .select({
      projectId: projectFiles.projectId,
      kind: projectFiles.kind,
    })
    .from(projectFiles)
    .where(
      and(
        inArray(projectFiles.projectId, projectIds),
        eq(projectFiles.status, "ready"),
        isNull(projectFiles.deletedAt),
      ),
    );

  for (const row of rows) {
    const summary = summaries.get(row.projectId) ?? {
      total: 0,
      presentation: 0,
      video: 0,
      audio: 0,
      code: 0,
    };
    summary.total++;
    if (row.kind === "presentation") summary.presentation++;
    if (row.kind === "video") summary.video++;
    if (row.kind === "audio") summary.audio++;
    if (row.kind === "code") summary.code++;
    summaries.set(row.projectId, summary);
  }
  return summaries;
}

export async function createProjectFileUpload(
  actorId: string,
  projectId: string,
  input: {
    name: string;
    sizeBytes: number;
    mimeType?: string | null;
    kind?: ProjectFileKind | "auto";
  },
) {
  await requireProjectMembership(actorId, projectId);

  const name = input.name.trim();
  if (!name) throw new AppError("请选择要上传的文件");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new AppError("文件大小无效");
  }
  const maxBytes = getMaxFileSizeBytes();
  if (input.sizeBytes > maxBytes) {
    throw new AppError(
      `文件超过 ${Math.floor(maxBytes / 1024 / 1024)} MB 限制`,
    );
  }
  if (!isAllowedProjectFile(name)) {
    throw new AppError("暂不支持该文件格式");
  }

  const id = randomUUID();
  const kind = resolveProjectFileKind(
    name,
    input.mimeType ?? "",
    input.kind ?? "auto",
  );
  const storageKey = `projects/${projectId}/${id}/${safeFilename(name)}`;
  const codeMeta =
    kind === "code"
      ? {
          primaryLanguage: inferPrimaryLanguage(name),
          directories: ["src/", "public/", "package.json", "README.md"],
          hasReadme: name.toLowerCase().includes("readme"),
        }
      : null;

  const [file] = await db
    .insert(projectFiles)
    .values({
      id,
      projectId,
      createdById: actorId,
      name,
      originalName: name,
      kind,
      source: "upload",
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes,
      storageKey,
      status: "uploading",
      codeMeta,
    })
    .returning();

  return {
    id: file.id,
    uploadUrl: `/api/project-files/${file.id}/content`,
  };
}

export async function createProjectFileLink(
  actorId: string,
  projectId: string,
  input: {
    name: string;
    url: string;
    kind: ProjectFileKind;
  },
) {
  await requireProjectMembership(actorId, projectId);

  const name = input.name.trim();
  if (!name) throw new AppError("请填写文件名称");
  const url = new URL(input.url.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("链接必须以 http:// 或 https:// 开头");
  }

  const codeMeta =
    input.kind === "code"
      ? {
          primaryLanguage: "Git Repository",
          directories: ["src/", "public/", "docs/", "README.md"],
          hasReadme: true,
        }
      : null;

  const [file] = await db
    .insert(projectFiles)
    .values({
      projectId,
      createdById: actorId,
      name,
      kind: input.kind,
      source: "link",
      externalUrl: url.toString(),
      status: "ready",
      codeMeta,
    })
    .returning();

  return file;
}

export async function getProjectFileAccess(
  actorId: string,
  fileId: string,
): Promise<ProjectFileAccess> {
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), isNull(projectFiles.deletedAt)));
  if (!file) throw new AppError("文件不存在");

  const access = await getProjectForUser(actorId, file.projectId);
  if (!access) throw new ForbiddenError();
  return { file, role: access.role };
}

export async function writeProjectFileUpload(
  actorId: string,
  fileId: string,
  stream: NodeJS.ReadableStream,
  contentLength?: number,
) {
  const access = await getProjectFileAccess(actorId, fileId);
  if (access.file.source !== "upload") {
    throw new AppError("链接文件不需要上传内容");
  }
  if (access.file.status === "ready") return access.file;

  const maxBytes = getMaxFileSizeBytes();
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new AppError(
      `文件超过 ${Math.floor(maxBytes / 1024 / 1024)} MB 限制`,
    );
  }

  let stored: StorageWriteResult | undefined;
  try {
    const storage = getFileStorage();
    stored = await storage.writeUpload({
      fileId,
      projectId: access.file.projectId,
      filename: access.file.name,
      stream,
      expectedSize: access.file.sizeBytes ?? undefined,
      maxBytes,
    });
    const [updated] = await db
      .update(projectFiles)
      .set({
        storageKey: stored.storageKey,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(projectFiles.id, fileId))
      .returning();
    return updated;
  } catch (error) {
    if (stored?.storageKey) {
      await getFileStorage().delete(stored.storageKey).catch(() => undefined);
    }
    await db
      .update(projectFiles)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(projectFiles.id, fileId));
    throw error;
  }
}

export async function deleteProjectFile(actorId: string, fileId: string) {
  const access = await getProjectFileAccess(actorId, fileId);
  const canDelete =
    access.role === "admin" || access.file.createdById === actorId;
  if (!canDelete) throw new ForbiddenError("只有上传者或管理员可以删除文件");

  await db
    .update(projectFiles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projectFiles.id, fileId));

  if (access.file.storageKey) {
    await getFileStorage()
      .delete(access.file.storageKey)
      .catch((error) => {
        console.error("[project-files] 删除磁盘文件失败", error);
      });
  }
  await deleteOfficePdfPreview(fileId).catch((error) => {
    console.error("[project-files] 删除 Office 预览缓存失败", error);
  });
}

export async function cleanupStaleProjectFileUploads() {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS);
  const stale = await db
    .select({ id: projectFiles.id })
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.status, "uploading"),
        lt(projectFiles.updatedAt, cutoff),
        isNull(projectFiles.deletedAt),
      ),
    );
  if (stale.length === 0) return 0;

  const storage = getFileStorage();
  await Promise.all(
    stale.map((file) => storage.deleteTemporaryUpload(file.id)),
  );
  await db
    .update(projectFiles)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      inArray(
        projectFiles.id,
        stale.map((file) => file.id),
      ),
    );
  await storage.cleanupTemporaryUploads(STALE_UPLOAD_MS);
  await cleanupOfficePreviewTemporaryFiles(STALE_UPLOAD_MS).catch((error) => {
    console.error("[project-files] 清理 Office 临时目录失败", error);
  });
  return stale.length;
}

function mapStoredProjectFile(
  row: {
    id: string;
    name: string;
    kind: ProjectFileKind;
    source: "upload" | "link";
    sizeBytes: number | null;
    externalUrl: string | null;
    status: "uploading" | "ready" | "failed";
    mimeType: string | null;
    codeMeta: unknown;
    createdById: string | null;
    owner: string | null;
    updatedAt: Date;
  },
  actorId: string,
  role: "admin" | "teacher" | "student",
): StoredProjectFile {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    source: row.source,
    url:
      row.source === "link"
        ? row.externalUrl ?? undefined
        : `/api/project-files/${row.id}/content`,
    sizeBytes: row.sizeBytes ?? undefined,
    codeMeta: (row.codeMeta as ProjectCodeMeta | null) ?? undefined,
    owner: row.owner ?? "未知用户",
    updatedAt: row.updatedAt.toISOString(),
    status: row.status,
    mimeType: row.mimeType,
    canDelete: role === "admin" || row.createdById === actorId,
  };
}

export function fileSummaryFor(files: ProjectFile[]) {
  return summarizeProjectFiles(files);
}
