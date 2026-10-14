"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  createProjectComment,
  deleteProjectComment,
  listProjectComments,
  updateProjectComment,
  type ProjectComment,
  type ProjectCommentPage,
} from "@/lib/project-comment";

const createSchema = z.object({
  projectId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  content: z.string().min(1).max(2000),
});

const updateSchema = z.object({
  projectId: z.uuid(),
  commentId: z.uuid(),
  content: z.string().min(1).max(2000),
});

const deleteSchema = z.object({
  projectId: z.uuid(),
  commentId: z.uuid(),
});

const pageSchema = z.object({
  projectId: z.uuid(),
  beforeCreatedAt: z.string().datetime(),
  beforeId: z.uuid(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type CommentActionResult =
  | { ok: true; comment: ProjectComment }
  | { ok: false; error: string };

export async function createCommentAction(
  input: z.infer<typeof createSchema>,
): Promise<CommentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  try {
    const parsed = createSchema.parse(input);
    const comment = await createProjectComment(
      session.user.id,
      parsed.projectId,
      { content: parsed.content, parentId: parsed.parentId ?? null },
    );
    revalidatePath(`/projects/${parsed.projectId}`);
    return { ok: true, comment };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "评论内容无效" };
    }
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function updateCommentAction(
  input: z.infer<typeof updateSchema>,
): Promise<CommentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  try {
    const parsed = updateSchema.parse(input);
    const comment = await updateProjectComment(
      session.user.id,
      parsed.commentId,
      parsed.content,
    );
    revalidatePath(`/projects/${parsed.projectId}`);
    return { ok: true, comment };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "评论内容无效" };
    }
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function deleteCommentAction(
  input: z.infer<typeof deleteSchema>,
): Promise<{ ok: true; deletedId: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  try {
    const parsed = deleteSchema.parse(input);
    await deleteProjectComment(session.user.id, parsed.commentId);
    revalidatePath(`/projects/${parsed.projectId}`);
    return { ok: true, deletedId: parsed.commentId };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "评论操作无效" };
    }
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function loadEarlierCommentsAction(
  input: z.infer<typeof pageSchema>,
): Promise<ProjectCommentPage | { error: string }> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  try {
    const parsed = pageSchema.parse(input);
    return await listProjectComments(session.user.id, parsed.projectId, {
      limit: parsed.limit,
      beforeCreatedAt: parsed.beforeCreatedAt,
      beforeId: parsed.beforeId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "分页参数无效" };
    }
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}
