"use server";

import { auth } from "@/lib/auth";
import { listTaskExternalEvents } from "@/lib/integrations";

export async function loadTaskDevelopmentEventsAction(taskId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("请先登录");
  return listTaskExternalEvents(session.user.id, taskId);
}
