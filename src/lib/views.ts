import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { savedTaskViews } from "@/db/schema";
import { AppError, ForbiddenError, isUniqueViolation } from "./errors";
import { getProjectForUser } from "./project";

export type SavedTaskView = {
  id: string;
  name: string;
  filters: string;
  createdAt: Date;
};

export async function listSavedTaskViews(
  actorId: string,
  projectId: string,
): Promise<SavedTaskView[]> {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return db
    .select({
      id: savedTaskViews.id,
      name: savedTaskViews.name,
      filters: savedTaskViews.filters,
      createdAt: savedTaskViews.createdAt,
    })
    .from(savedTaskViews)
    .where(
      and(
        eq(savedTaskViews.userId, actorId),
        eq(savedTaskViews.projectId, projectId),
      ),
    )
    .orderBy(asc(savedTaskViews.name));
}

export async function createSavedTaskView(
  actorId: string,
  projectId: string,
  input: { name: string; filters: string },
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  const name = input.name.trim();
  if (!name) throw new AppError("请填写视图名称");
  if (name.length > 40) throw new AppError("视图名称最多 40 字");
  if (input.filters.length > 2000) throw new AppError("筛选条件过长");

  const [count] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(savedTaskViews)
    .where(
      and(
        eq(savedTaskViews.userId, actorId),
        eq(savedTaskViews.projectId, projectId),
      ),
    );
  if ((count?.value ?? 0) >= 20) {
    throw new AppError("每个项目最多保存 20 个视图");
  }

  try {
    const [view] = await db
      .insert(savedTaskViews)
      .values({
        userId: actorId,
        projectId,
        name,
        filters: input.filters,
      })
      .returning();
    return view;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("该视图名称已存在");
    throw error;
  }
}

export async function deleteSavedTaskView(actorId: string, viewId: string) {
  const [view] = await db
    .select({
      id: savedTaskViews.id,
      userId: savedTaskViews.userId,
      projectId: savedTaskViews.projectId,
    })
    .from(savedTaskViews)
    .where(eq(savedTaskViews.id, viewId));
  if (!view) throw new AppError("视图不存在");
  if (view.userId !== actorId) throw new ForbiddenError();
  await db.delete(savedTaskViews).where(eq(savedTaskViews.id, viewId));
  return { projectId: view.projectId };
}
