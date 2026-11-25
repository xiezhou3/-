"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  createTaskComment,
  deleteTaskComment,
  listTaskCollaboration,
  setTaskWatching,
  updateTaskComment,
} from "@/lib/task-collaboration";

export type CollaborationActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

function mapError(error: unknown) {
  if (error instanceof AppError) return { ok: false as const, error: error.message };
  throw error;
}

export async function loadTaskCollaborationAction(taskId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");
  const data = await listTaskCollaboration(session.user.id, taskId);
  return {
    ...data,
    comments: data.comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      deletedAt: comment.deletedAt?.toISOString() ?? null,
    })),
  };
}

const createSchema = z.object({
  taskId: z.uuid(),
  projectId: z.uuid(),
  content: z.string().trim().min(1, "评论内容不能为空").max(2000),
  parentId: z.uuid().optional(),
  mentionIds: z.array(z.uuid()).optional(),
  projectFileIds: z.array(z.uuid()).optional(),
});

export async function createTaskCommentAction(
  input: z.infer<typeof createSchema>,
): Promise<CollaborationActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await createTaskComment(session.user.id, parsed.data.taskId, parsed.data);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath("/invitations");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: error.message };
    }
    return mapError(error);
  }
}

const updateSchema = z.object({
  commentId: z.uuid(),
  projectId: z.uuid(),
  content: z.string().trim().min(1).max(2000),
});

export async function updateTaskCommentAction(
  input: z.infer<typeof updateSchema>,
): Promise<CollaborationActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "评论内容无效" };
  try {
    await updateTaskComment(session.user.id, parsed.data.commentId, parsed.data.content);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

const deleteSchema = z.object({
  commentId: z.uuid(),
  projectId: z.uuid(),
});

export async function deleteTaskCommentAction(
  input: z.infer<typeof deleteSchema>,
): Promise<CollaborationActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "参数无效" };
  try {
    await deleteTaskComment(session.user.id, parsed.data.commentId);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

const watchSchema = z.object({
  taskId: z.uuid(),
  projectId: z.uuid(),
  watching: z.boolean(),
});

export async function setTaskWatchingAction(
  input: z.infer<typeof watchSchema>,
): Promise<CollaborationActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = watchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "参数无效" };
  try {
    await setTaskWatching(session.user.id, parsed.data.taskId, parsed.data.watching);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
