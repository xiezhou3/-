"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, unstable_update } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { changePassword, unbindFeishu, updateProfile } from "@/lib/user";

export type SettingsFormState =
  | { status: "success"; message: string }
  | { status: "error"; message: string }
  | null;

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请填写姓名")
    .max(50, "姓名最长 50 位"),
});

export async function updateProfileAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  try {
    const user = await updateProfile(session.user.id, parsed.data);
    await unstable_update({ user: { name: user.name, email: user.email } });
    revalidatePath("/settings", "layout");
    return { status: "success", message: "个人资料已更新。" };
  } catch (error) {
    if (error instanceof AppError) return { status: "error", message: error.message };
    throw error;
  }
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z
    .string()
    .min(8, "新密码至少 8 位")
    .max(64, "新密码最长 64 位"),
  confirmPassword: z.string().min(1, "请再次输入新密码"),
});

export async function changePasswordAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { status: "error", message: "两次输入的新密码不一致" };
  }

  try {
    await changePassword(session.user.id, parsed.data);
    revalidatePath("/settings/security");
    return { status: "success", message: "密码已更新。" };
  } catch (error) {
    if (error instanceof AppError) return { status: "error", message: error.message };
    throw error;
  }
}

export async function unbindFeishuAction() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  await unbindFeishu(session.user.id);
  revalidatePath("/settings/security");
}
