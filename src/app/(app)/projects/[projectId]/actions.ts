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
import { WORK_ITEM_TYPES } from "@/lib/work-item";
import { batchUpdateTasks } from "@/lib/workflow";

export type FormState = { error: string } | null;
// 更新任务专用：成功回 { ok: true }，供编辑弹窗据以自闭
export type UpdateTaskState = { error: string } | { ok: true } | null;
export type CreatedTask = {
  id: string;
  taskNumber: number | null;
  title: string;
  description: string | null;
  completionNote: string | null;
  status: "todo" | "doing" | "done";
  statusId: string | null;
  priority: "low" | "medium" | "high";
  workItemType: "epic" | "story" | "task" | "bug";
  bugSeverity: "blocker" | "critical" | "major" | "minor" | null;
  parentWorkItemId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimate: number | null;
  estimatedHours: number | null;
  sprintId: string | null;
  releaseId: string | null;
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
        projectFileId: string | null;
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
  workItemType: z.enum(WORK_ITEM_TYPES).optional(),
  bugSeverity: z.enum(["blocker", "critical", "major", "minor"]).optional(),
  parentWorkItemId: z.uuid().optional(),
  description: z.string().trim().optional(),
  assigneeId: z.uuid().optional(),
  assigneeIds: z.array(z.uuid()).optional(),
  startDate: z.iso.date("日期格式不正确").optional(),
  dueDate: z.iso.date("日期格式不正确").optional(),
  milestoneId: z.uuid().optional(),
  sprintId: z.uuid().optional(),
  releaseId: z.uuid().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  estimate: z.coerce.number().int("故事点必须是整数").min(0, "故事点不能为负数").optional(),
  estimatedHours: z.coerce
    .number()
    .min(0, "预估工时不能为负数")
    .optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  statusId: z.uuid().optional(),
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
    workItemType: raw.workItemType || undefined,
    bugSeverity: raw.bugSeverity || undefined,
    parentWorkItemId: raw.parentWorkItemId || undefined,
    assigneeId: raw.assigneeId || undefined,
    assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
    startDate: raw.startDate || undefined,
    dueDate: raw.dueDate || undefined,
    milestoneId: raw.milestoneId || undefined,
    sprintId: raw.sprintId || undefined,
    releaseId: raw.releaseId || undefined,
    priority: raw.priority || undefined,
    estimate:
      raw.estimate === "" || raw.estimate === undefined
        ? undefined
        : raw.estimate,
    estimatedHours:
      raw.estimatedHours === "" || raw.estimatedHours === undefined
        ? undefined
        : raw.estimatedHours,
    status: raw.status || undefined,
    statusId: raw.statusId || undefined,
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
        taskNumber: task.taskNumber,
        title: task.title,
        description: task.description,
        completionNote: task.completionNote,
        status: task.status,
        statusId: task.statusId,
        priority: task.priority,
        workItemType: task.workItemType,
        bugSeverity: task.bugSeverity,
        parentWorkItemId: task.parentWorkItemId,
        startDate: task.startDate,
        dueDate: task.dueDate,
        estimate: task.estimate,
        estimatedHours: task.estimatedHours,
        sprintId: task.sprintId,
        releaseId: task.releaseId,
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
  projectFileId: z.uuid(),
});

export async function addTaskAttachmentAction(input: {
  taskId: string;
  projectId: string;
  projectFileId: string;
}): Promise<TaskAttachmentState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };

  const parsed = addTaskAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  try {
    const attachment = await addTaskAttachment(session.user.id, parsed.data.taskId, {
      projectFileId: parsed.data.projectFileId,
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
  workItemType: z.enum(WORK_ITEM_TYPES),
  bugSeverity: z.enum(["blocker", "critical", "major", "minor"]).optional(),
  parentWorkItemId: z.uuid().optional(),
  description: z.string().trim().optional(),
  assigneeId: z.uuid().optional(),
  assigneeIds: z.array(z.uuid()).optional(),
  milestoneId: z.uuid().optional(),
  sprintId: z.uuid().optional(),
  releaseId: z.uuid().optional(),
  startDate: z.iso.date("日期格式不正确").optional(),
  dueDate: z.iso.date("日期格式不正确").optional(),
  priority: z.enum(["low", "medium", "high"]),
  estimate: z.coerce.number().int("故事点必须是整数").min(0, "故事点不能为负数").optional(),
  estimatedHours: z.coerce
    .number()
    .min(0, "预估工时不能为负数")
    .optional(),
  statusId: z.uuid().optional(),
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
    parentWorkItemId: raw.parentWorkItemId || undefined,
    bugSeverity: raw.bugSeverity || undefined,
    assigneeId: raw.assigneeId || undefined,
    assigneeIds,
    milestoneId: raw.milestoneId || undefined,
    sprintId: raw.sprintId || undefined,
    releaseId: raw.releaseId || undefined,
    startDate: raw.startDate || undefined,
    dueDate: raw.dueDate || undefined,
    estimate:
      raw.estimate === "" || raw.estimate === undefined
        ? undefined
        : raw.estimate,
    estimatedHours:
      raw.estimatedHours === "" || raw.estimatedHours === undefined
        ? undefined
        : raw.estimatedHours,
    statusId: raw.statusId || undefined,
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
      workItemType: patch.workItemType,
      bugSeverity: patch.bugSeverity ?? null,
      parentWorkItemId: patch.parentWorkItemId ?? null,
      description: patch.description ?? null,
      assigneeId: patch.assigneeId ?? null,
      assigneeIds: patch.assigneeIds,
      milestoneId: patch.milestoneId ?? null,
      sprintId: patch.sprintId ?? null,
      releaseId: patch.releaseId ?? null,
      startDate: patch.startDate ?? null,
      dueDate: patch.dueDate ?? null,
      priority: patch.priority,
      estimate: patch.estimate ?? null,
      estimatedHours: patch.estimatedHours ?? null,
      statusId: patch.statusId,
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

const batchUpdateSchema = z.object({
  projectId: z.uuid(),
  taskIds: z.array(z.uuid()).min(1, "请选择任务"),
  statusId: z.uuid().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assigneeIds: z.array(z.uuid()).optional(),
});

export async function batchUpdateTasksAction(input: {
  projectId: string;
  taskIds: string[];
  statusId?: string;
  priority?: "low" | "medium" | "high";
  assigneeIds?: string[];
}): Promise<UpdateTaskState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  const parsed = batchUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await batchUpdateTasks(
      session.user.id,
      parsed.data.projectId,
      parsed.data.taskIds,
      {
        statusId: parsed.data.statusId,
        priority: parsed.data.priority,
        assigneeIds: parsed.data.assigneeIds,
      },
    );
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}
