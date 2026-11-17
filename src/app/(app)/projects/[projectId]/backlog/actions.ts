"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createBacklogTask, reorderBacklog } from "@/lib/backlog";
import { AppError, ForbiddenError } from "@/lib/errors";

export type BacklogActionResult =
  | { ok: true; taskId?: string }
  | { ok: false; error: string };

function revalidateBacklog(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/backlog`);
  revalidatePath(`/projects/${projectId}/sprints`);
}

const createSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1, "请填写任务标题").max(200, "任务标题最多 200 字"),
});

export async function createBacklogTaskAction(input: {
  projectId: string;
  title: string;
}): Promise<BacklogActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const task = await createBacklogTask(
      session.user.id,
      parsed.data.projectId,
      parsed.data.title,
    );
    revalidateBacklog(parsed.data.projectId);
    return { ok: true, taskId: task.id };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "只有项目管理员和学生可以创建 Backlog 任务" };
    }
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}

const reorderSchema = z.object({
  projectId: z.uuid(),
  sprintId: z.uuid(),
  backlogTaskIds: z.array(z.uuid()),
  sprintTaskIds: z.array(z.uuid()),
});

export async function reorderBacklogAction(input: {
  projectId: string;
  sprintId: string;
  backlogTaskIds: string[];
  sprintTaskIds: string[];
}): Promise<BacklogActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Backlog 排序参数无效" };

  try {
    await reorderBacklog(
      session.user.id,
      parsed.data.projectId,
      parsed.data.sprintId,
      parsed.data.backlogTaskIds,
      parsed.data.sprintTaskIds,
    );
    revalidateBacklog(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "只有项目管理员和学生可以规划 Backlog" };
    }
    if (error instanceof AppError) return { ok: false, error: error.message };
    throw error;
  }
}
