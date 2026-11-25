"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  createTaskWorkLog,
  deleteTaskWorkLog,
  getTaskWorkLogs,
} from "@/lib/planning";

const createSchema = z.object({
  taskId: z.uuid(),
  projectId: z.uuid(),
  hours: z.coerce.number().positive("请输入有效工时").max(24, "单条工时不能超过 24 小时"),
  workDate: z.iso.date("日期格式不正确"),
  note: z.string().trim().max(500, "工时说明最多 500 字").optional(),
});

const deleteSchema = z.object({
  workLogId: z.uuid(),
  projectId: z.uuid(),
});

function revalidatePlanningViews(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/reports`);
}

export async function loadTaskWorkLogsAction(taskId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");
  return getTaskWorkLogs(session.user.id, taskId);
}

export async function createTaskWorkLogAction(input: {
  taskId: string;
  projectId: string;
  hours: string | number;
  workDate: string;
  note?: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  try {
    await createTaskWorkLog(session.user.id, {
      taskId: parsed.data.taskId,
      hours: parsed.data.hours,
      workDate: parsed.data.workDate,
      note: parsed.data.note,
    });
    revalidatePlanningViews(parsed.data.projectId);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}

export async function deleteTaskWorkLogAction(input: {
  workLogId: string;
  projectId: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "参数无效" };
  }
  try {
    await deleteTaskWorkLog(session.user.id, parsed.data.workLogId);
    revalidatePlanningViews(parsed.data.projectId);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}
