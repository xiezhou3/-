"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  addTaskAttachment,
  createTask,
  updateTask,
  deleteTask,
  setTaskSuccessors,
} from "@/lib/task";
import { submitTaskForReview } from "@/lib/task-review";
import { setTaskLabels } from "@/lib/label";
import { createMilestone } from "@/lib/project";
import { AppError, ForbiddenError } from "@/lib/errors";

export type FormState = { error: string } | null;
// 更新任务专用：成功回 { ok: true }，供编辑弹窗据以自闭
export type UpdateTaskState = { error: string } | { ok: true } | null;
export type CreatedTask = {
  id: string;
  title: string;
  description: string | null;
  completionNote: string | null;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeIds: string[];
  milestoneId: string | null;
};
export type CreateTaskState =
  | { ok: true; task: CreatedTask }
  | { ok: false; error: string };

export type TaskAttachmentState =
  | {
      ok: true;
      attachment: {
        id: string;
        taskId: string;
        name: string;
        url: string;
        createdById: string | null;
        createdByName: string | null;
        createdAt: string;
      };
    }
  | { ok: false; error: string };

const createTaskSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1, "请填写任务标题"),
  description: z.string().trim().optional(),
  assigneeId: z.uuid().optional(),
  assigneeIds: z.array(z.uuid()).optional(),
  startDate: z.iso.date("日期格式不正确").optional(),
  dueDate: z.iso.date("日期格式不正确").optional(),
  milestoneId: z.uuid().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
});

export async function createTaskAction(
  formData: FormData,
): Promise<CreateTaskState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };

  const raw = Object.fromEntries(formData);
  const assigneeIds = formData.getAll("assigneeIds").map(String).filter(Boolean);
  const parsed = createTaskSchema.safeParse({
    ...raw,
    assigneeId: raw.assigneeId || undefined,
    assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
    startDate: raw.startDate || undefined,
    dueDate: raw.dueDate || undefined,
    milestoneId: raw.milestoneId || undefined,
    priority: raw.priority || undefined,
    status: raw.status || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { projectId, ...input } = parsed.data;
  try {
    const task = await createTask(session.user.id, projectId, input);
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        completionNote: task.completionNote,
        status: task.status,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        assigneeId: task.assigneeId,
        assigneeIds:
          assigneeIds.length > 0
            ? assigneeIds
            : task.assigneeId
              ? [task.assigneeId]
              : [],
        milestoneId: task.milestoneId,
      },
    };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, error: "没有权限创建任务" };
    }
    if (e instanceof AppError) return { ok: false, error: e.message };
    throw e;
  }
}

const addTaskAttachmentSchema = z.object({
  taskId: z.uuid(),
  projectId: z.uuid(),
  name: z.string().trim().max(120).optional(),
  url: z.string().trim().min(1, "请填写文件链接"),
});

export async function addTaskAttachmentAction(input: {
  taskId: string;
  projectId: string;
  name?: string;
  url: string;
}): Promise<TaskAttachmentState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };

  const parsed = addTaskAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  try {
    const attachment = await addTaskAttachment(session.user.id, parsed.data.taskId, {
      name: parsed.data.name,
      url: parsed.data.url,
    });
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return {
      ok: true,
      attachment: {
        ...attachment,
        createdAt: attachment.createdAt.toISOString(),
        createdByName: session.user.name ?? null,
      },
    };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}

const submitTaskReviewSchema = z.object({
  taskId: z.uuid(),
  projectId: z.uuid(),
});

export async function submitTaskForReviewAction(input: {
  taskId: string;
  projectId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = submitTaskReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "提交参数无效" };

  try {
    await submitTaskForReview(session.user.id, parsed.data.taskId);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath("/invitations");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}

const createMilestoneSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1, "请填写里程碑标题"),
  targetDate: z.iso.date("日期格式不正确").optional(),
});

export async function createMilestoneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const raw = Object.fromEntries(formData);
  const parsed = createMilestoneSchema.safeParse({
    ...raw,
    targetDate: raw.targetDate || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await createMilestone(session.user.id, parsed.data.projectId, {
      title: parsed.data.title,
      targetDate: parsed.data.targetDate,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "仅团队管理员可创建里程碑" };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return null;
}

const updateTaskSchema = z.object({
  taskId: z.uuid(),
  projectId: z.uuid(),
  title: z.string().trim().min(1, "标题不可为空"),
  description: z.string().trim().optional(),
  assigneeId: z.uuid().optional(),
  assigneeIds: z.array(z.uuid()).optional(),
  milestoneId: z.uuid().optional(),
  startDate: z.iso.date("日期格式不正确").optional(),
  dueDate: z.iso.date("日期格式不正确").optional(),
  priority: z.enum(["low", "medium", "high"]),
  completionNote: z.string().trim().optional(),
});

export async function updateTaskAction(
  _prev: UpdateTaskState,
  formData: FormData,
): Promise<UpdateTaskState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const raw = Object.fromEntries(formData);
  const assigneeIds = formData.getAll("assigneeIds").map(String).filter(Boolean);
  const parsed = updateTaskSchema.safeParse({
    ...raw,
    assigneeId: raw.assigneeId || undefined,
    assigneeIds,
    milestoneId: raw.milestoneId || undefined,
    startDate: raw.startDate || undefined,
    dueDate: raw.dueDate || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { taskId, projectId, ...patch } = parsed.data;
  const successorIds = formData
    .getAll("successorIds")
    .map(String)
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  const labelIds = formData
    .getAll("labelIds")
    .map(String)
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  try {
    await updateTask(session.user.id, taskId, {
      title: patch.title,
      description: patch.description ?? null,
      assigneeId: patch.assigneeId ?? null,
      assigneeIds: patch.assigneeIds,
      milestoneId: patch.milestoneId ?? null,
      startDate: patch.startDate ?? null,
      dueDate: patch.dueDate ?? null,
      priority: patch.priority,
      completionNote: patch.completionNote ?? null,
    });
    await setTaskSuccessors(session.user.id, taskId, successorIds);
    await setTaskLabels(session.user.id, taskId, labelIds);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

const deleteTaskSchema = z.object({
  taskId: z.uuid(),
  projectId: z.uuid(),
});

export async function deleteTaskAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = deleteTaskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "参数无效" };

  try {
    await deleteTask(session.user.id, parsed.data.taskId);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "没有权限删除任务" };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return null;
}
