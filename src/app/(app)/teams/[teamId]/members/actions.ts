"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { updateMemberRole } from "@/lib/team";
import { inviteTeamMember, revokeTeamInvitation } from "@/lib/invitation";
import { AppError } from "@/lib/errors";

const schema = z.object({
  teamId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["admin", "teacher", "student"]),
});

export async function updateRoleAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new AppError("请先登录");

  const parsed = schema.parse(Object.fromEntries(formData));
  await updateMemberRole(session.user.id, parsed.teamId, parsed.userId, parsed.role);
  revalidatePath(`/teams/${parsed.teamId}/members`);
}

export type InviteFormState = { error?: string; success?: string } | null;

const inviteSchema = z.object({
  teamId: z.uuid(),
  email: z.email("邮箱格式不正确"),
  name: z.string().trim().max(50, "姓名最长 50 位").optional(),
});

export async function inviteMemberAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = inviteSchema.safeParse({
    teamId: formData.get("teamId"),
    email: formData.get("email"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await inviteTeamMember(session.user.id, parsed.data.teamId, parsed.data);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/teams/${parsed.data.teamId}/members`);
  revalidatePath("/", "layout");
  return { success: "邀请已发送" };
}

const revokeSchema = z.object({
  teamId: z.uuid(),
  invitationId: z.uuid(),
});

export async function revokeInvitationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new AppError("请先登录");

  const parsed = revokeSchema.parse(Object.fromEntries(formData));
  await revokeTeamInvitation(
    session.user.id,
    parsed.teamId,
    parsed.invitationId,
  );
  revalidatePath(`/teams/${parsed.teamId}/members`);
  revalidatePath("/", "layout");
}
