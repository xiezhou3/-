"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  createRelease,
  deleteRelease,
  saveSprintCapacities,
  updateRelease,
} from "@/lib/planning";

export type PlanningActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

const releaseFieldsSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "请填写版本名称").max(120, "版本名称最多 120 字"),
  description: z.string().trim().max(2000, "版本说明最多 2000 字").optional(),
  status: z.enum(["planned", "active", "released", "cancelled"]),
  startDate: z.iso.date("开始日期格式不正确").optional(),
  targetDate: z.iso.date("目标日期格式不正确").optional(),
  releaseDate: z.iso.date("发布日期格式不正确").optional(),
});

const updateReleaseSchema = releaseFieldsSchema.extend({
  releaseId: z.uuid(),
});

const capacitySchema = z.object({
  projectId: z.uuid(),
  sprintId: z.uuid(),
});

function mapError(error: unknown): PlanningActionState {
  if (error instanceof ForbiddenError) {
    return { ok: false, error: "只有项目管理员和学生可以修改规划" };
  }
  if (error instanceof AppError) return { ok: false, error: error.message };
  throw error;
}

function revalidatePlanningViews(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/planning`);
  revalidatePath(`/projects/${projectId}/reports`);
  revalidatePath(`/projects/${projectId}/timeline`);
}

export async function createReleaseAction(
  _prev: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const raw = Object.fromEntries(formData);
  const parsed = releaseFieldsSchema.safeParse({
    ...raw,
    description: raw.description || undefined,
    startDate: raw.startDate || undefined,
    targetDate: raw.targetDate || undefined,
    releaseDate: raw.releaseDate || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { projectId, ...input } = parsed.data;
  try {
    await createRelease(session.user.id, projectId, input);
    revalidatePlanningViews(projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateReleaseAction(
  _prev: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const raw = Object.fromEntries(formData);
  const parsed = updateReleaseSchema.safeParse({
    ...raw,
    description: raw.description || undefined,
    startDate: raw.startDate || undefined,
    targetDate: raw.targetDate || undefined,
    releaseDate: raw.releaseDate || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { projectId, releaseId, ...patch } = parsed.data;
  try {
    await updateRelease(session.user.id, releaseId, patch);
    revalidatePlanningViews(projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteReleaseAction(
  _prev: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = z
    .object({ projectId: z.uuid(), releaseId: z.uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "参数无效" };
  try {
    await deleteRelease(session.user.id, parsed.data.releaseId);
    revalidatePlanningViews(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function saveSprintCapacityAction(
  _prev: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = capacitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "参数无效" };

  const hoursByUser: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("hours_")) continue;
    const userId = key.slice("hours_".length);
    const hours = z.coerce.number().safeParse(value);
    if (!userId || !hours.success) {
      return { ok: false, error: "成员容量格式不正确" };
    }
    hoursByUser[userId] = hours.data;
  }

  try {
    await saveSprintCapacities(
      session.user.id,
      parsed.data.projectId,
      parsed.data.sprintId,
      hoursByUser,
    );
    revalidatePlanningViews(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
