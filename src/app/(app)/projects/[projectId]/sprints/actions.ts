"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  assignTasksToSprint,
  closeSprint,
  createSprint,
  startSprint,
  updateSprint,
  type CloseSprintDestination,
} from "@/lib/sprint";

export type SprintActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

const sprintFieldsSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "请填写迭代名称").max(120, "迭代名称最多 120 字"),
  goal: z.string().trim().max(2000, "迭代目标最多 2000 字").optional(),
  startDate: z.iso.date("开始日期格式不正确"),
  endDate: z.iso.date("结束日期格式不正确"),
  capacity: z.coerce.number().int("容量必须是整数").min(0, "容量不能为负数"),
});

const updateSprintSchema = sprintFieldsSchema.extend({
  sprintId: z.uuid(),
});

function mapError(error: unknown) {
  if (error instanceof AppError) return { ok: false as const, error: error.message };
  throw error;
}

function revalidateSprintViews(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/sprints`);
  revalidatePath("/projects");
}

export async function createSprintAction(
  _prev: SprintActionState,
  formData: FormData,
): Promise<SprintActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };

  const raw = Object.fromEntries(formData);
  const parsed = sprintFieldsSchema.safeParse({
    ...raw,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { projectId, ...input } = parsed.data;
  try {
    await createSprint(session.user.id, projectId, input);
    revalidateSprintViews(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "只有项目管理员和学生可以管理迭代" };
    }
    return mapError(error);
  }
}

export async function updateSprintAction(
  _prev: SprintActionState,
  formData: FormData,
): Promise<SprintActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };

  const raw = Object.fromEntries(formData);
  const parsed = updateSprintSchema.safeParse({
    ...raw,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { projectId, sprintId, ...patch } = parsed.data;
  try {
    await updateSprint(session.user.id, sprintId, patch);
    revalidateSprintViews(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "只有项目管理员和学生可以管理迭代" };
    }
    return mapError(error);
  }
}

const sprintIdSchema = z.object({
  projectId: z.uuid(),
  sprintId: z.uuid(),
});

export async function startSprintAction(input: {
  projectId: string;
  sprintId: string;
}): Promise<SprintActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = sprintIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "参数无效" };

  try {
    await startSprint(session.user.id, parsed.data.sprintId);
    revalidateSprintViews(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "只有项目管理员和学生可以启动迭代" };
    }
    return mapError(error);
  }
}

const closeSprintSchema = sprintIdSchema.extend({
  destination: z.enum(["backlog", "sprint"]),
  targetSprintId: z.uuid().optional(),
});

export async function closeSprintAction(input: {
  projectId: string;
  sprintId: string;
  destination: "backlog" | "sprint";
  targetSprintId?: string;
}): Promise<SprintActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = closeSprintSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "请选择未完成任务的去向" };
  if (parsed.data.destination === "sprint" && !parsed.data.targetSprintId) {
    return { ok: false, error: "请选择目标迭代" };
  }

  const destination: CloseSprintDestination =
    parsed.data.destination === "sprint"
      ? { type: "sprint", targetSprintId: parsed.data.targetSprintId! }
      : { type: "backlog" };

  try {
    await closeSprint(
      session.user.id,
      parsed.data.sprintId,
      destination,
    );
    revalidateSprintViews(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "只有项目管理员和学生可以关闭迭代" };
    }
    return mapError(error);
  }
}

const assignTasksSchema = z.object({
  projectId: z.uuid(),
  sprintId: z.uuid().nullable(),
  taskIds: z.array(z.uuid()).min(1, "请选择任务"),
});

export async function assignTasksToSprintAction(input: {
  projectId: string;
  sprintId: string | null;
  taskIds: string[];
}): Promise<SprintActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = assignTasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  try {
    await assignTasksToSprint(
      session.user.id,
      parsed.data.projectId,
      parsed.data.taskIds,
      parsed.data.sprintId,
    );
    revalidateSprintViews(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "只有项目管理员和学生可以规划迭代" };
    }
    return mapError(error);
  }
}
