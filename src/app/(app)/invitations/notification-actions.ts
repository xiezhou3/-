"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification";

const schema = z.object({ notificationId: z.uuid() });

export async function markNotificationReadAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await markNotificationRead(
    session.user.id,
    parsed.data.notificationId,
  );
  revalidatePath("/invitations");
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction() {
  const session = await auth();
  if (!session?.user) return;
  await markAllNotificationsRead(session.user.id);
  revalidatePath("/invitations");
  revalidatePath("/", "layout");
}
