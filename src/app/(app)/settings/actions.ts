"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, unstable_update } from "@/lib/auth";
import { unbindFeishu, updateUserName } from "@/lib/user";

export type ProfileState = { error: string } | { ok: true } | null;

export async function unbindFeishuAction() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  await unbindFeishu(session.user.id);
  revalidatePath("/settings");
}

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "请填写昵称" };
  if (name.length > 40) return { error: "昵称不超过 40 个字" };

  await updateUserName(session.user.id, name);
  // 同步 JWT 里的展示名，免得顶部与工作台仍是旧名字
  await unstable_update({ user: { name } });
  revalidatePath("/settings");
  return { ok: true };
}
