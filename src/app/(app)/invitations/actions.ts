"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { respondToInvitation } from "@/lib/invitation";
import { AppError } from "@/lib/errors";

const responseSchema = z.object({
  invitationId: z.uuid(),
  response: z.enum(["accept", "reject"]),
});

export type InvitationResponseState = { error: string } | null;

export async function respondInvitationAction(
  _prev: InvitationResponseState,
  formData: FormData,
): Promise<InvitationResponseState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = responseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "邀请操作无效" };

  try {
    await respondToInvitation(
      session.user.id,
      parsed.data.invitationId,
      parsed.data.response,
    );
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }

  revalidatePath("/invitations");
  revalidatePath("/teams");
  revalidatePath("/", "layout");
  return null;
}
