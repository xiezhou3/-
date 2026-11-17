"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  createSavedTaskView,
  deleteSavedTaskView,
} from "@/lib/views";

const createSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "请填写视图名称").max(40, "视图名称最多 40 字"),
  filters: z.string().max(2000),
});

export async function saveSavedViewAction(input: {
  projectId: string;
  name: string;
  filters: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  try {
    await createSavedTaskView(
      session.user.id,
      parsed.data.projectId,
      parsed.data,
    );
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false as const, error: "没有权限保存该视图" };
    }
    if (error instanceof AppError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}

export async function deleteSavedViewAction(input: {
  viewId: string;
  projectId: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = z
    .object({ viewId: z.uuid(), projectId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "参数无效" };
  try {
    await deleteSavedTaskView(session.user.id, parsed.data.viewId);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}
