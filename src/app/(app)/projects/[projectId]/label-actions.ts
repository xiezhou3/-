"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createLabel, deleteLabel } from "@/lib/label";
import { AppError, ForbiddenError } from "@/lib/errors";

export type LabelFormState = { error: string } | null;

const COLOR = z.enum(["slate", "red", "amber", "green", "blue", "violet", "pink"]);

const createSchema = z.object({
  projectId: z.uuid(),
  teamId: z.uuid(),
  name: z.string().trim().min(1, "请填写标签名").max(20, "标签名不超过 20 字"),
  color: COLOR,
});

// 标签归属团队，但从项目界面创建——revalidate 项目页本身，创建后立即可见。
export async function createLabelForProjectAction(
  _prev: LabelFormState,
  formData: FormData,
): Promise<LabelFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await createLabel(session.user.id, parsed.data.teamId, {
      name: parsed.data.name,
      color: parsed.data.color,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "仅团队管理员可管理标签" };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/teams/${parsed.data.teamId}/labels`);
  return null;
}

const deleteSchema = z.object({
  projectId: z.uuid(),
  teamId: z.uuid(),
  labelId: z.uuid(),
});

export async function deleteLabelForProjectAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  try {
    await deleteLabel(session.user.id, parsed.data.labelId);
  } catch {
    // 删除失败（权限/已不存在）时不抛给客户端，页面刷新后状态自会纠正
    return;
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/teams/${parsed.data.teamId}/labels`);
}
