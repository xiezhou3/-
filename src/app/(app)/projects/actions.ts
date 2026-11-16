"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createProject } from "@/lib/project";
import { AppError, ForbiddenError } from "@/lib/errors";

const schema = z.object({
  teamId: z.uuid(),
  name: z.string().trim().min(1, "请填写项目名称").max(80, "项目名称不超过 80 字"),
  description: z.string().trim().max(2000, "描述不超过 2000 字").optional(),
  startDate: z.iso.date("日期格式不正确").optional(),
  endDate: z.iso.date("日期格式不正确").optional(),
});

export type CreateProjectResult =
  | { error: string }
  | { ok: true; projectId: string }
  | null;

export async function createProjectForMeAction(input: {
  teamId: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}): Promise<CreateProjectResult> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (
    parsed.data.startDate &&
    parsed.data.endDate &&
    parsed.data.startDate > parsed.data.endDate
  ) {
    return { error: "开始日期不能晚于结束日期" };
  }

  try {
    const project = await createProject(session.user.id, parsed.data.teamId, {
      name: parsed.data.name,
      description: parsed.data.description,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    revalidatePath("/projects");
    revalidatePath(`/teams/${parsed.data.teamId}/projects`);
    return { ok: true, projectId: project.id };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "仅团队管理员可创建项目" };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
