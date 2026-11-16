"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createTeam, joinTeam, renameTeam } from "@/lib/team";
import { AppError, ForbiddenError } from "@/lib/errors";

export type FormState = { error: string } | null;

const nameSchema = z.string().trim().min(1, "请填写团队名称");
const inviteCodeSchema = z.string().trim().min(1, "请填写邀请码");

export async function createTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = nameSchema.safeParse(formData.get("name") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await createTeam(session.user.id, parsed.data);
  revalidatePath("/teams");
  return null;
}

export async function renameTeamAction(input: {
  teamId: string;
  name: string;
}): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = nameSchema.safeParse(input.name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await renameTeam(session.user.id, input.teamId, parsed.data);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "仅团队管理员可修改团队名称" };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  revalidatePath("/teams");
  return null;
}

export async function joinTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = inviteCodeSchema.safeParse(formData.get("inviteCode") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await joinTeam(session.user.id, parsed.data);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  revalidatePath("/teams");
  return null;
}
