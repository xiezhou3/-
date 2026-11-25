import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, recentVisits, tasks } from "@/db/schema";
import { ForbiddenError } from "./errors";
import { getProjectForUser } from "./project";

export type RecentVisit = {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskTitle: string | null;
  label: string;
  path: string;
  visitedAt: Date;
};

export async function recordRecentVisit(
  actorId: string,
  input: {
    projectId: string;
    taskId?: string | null;
    label: string;
    path: string;
  },
) {
  const access = await getProjectForUser(actorId, input.projectId);
  if (!access) throw new ForbiddenError();
  await db
    .insert(recentVisits)
    .values({
      userId: actorId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      label: input.label.slice(0, 160),
      path: input.path,
    })
    .onConflictDoUpdate({
      target: [recentVisits.userId, recentVisits.path],
      set: {
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        label: input.label.slice(0, 160),
        visitedAt: sql`now()`,
      },
    });
}

export async function listRecentVisits(
  actorId: string,
  limit = 8,
): Promise<RecentVisit[]> {
  return db
    .select({
      id: recentVisits.id,
      projectId: recentVisits.projectId,
      projectName: projects.name,
      taskId: recentVisits.taskId,
      taskTitle: tasks.title,
      label: recentVisits.label,
      path: recentVisits.path,
      visitedAt: recentVisits.visitedAt,
    })
    .from(recentVisits)
    .innerJoin(projects, eq(recentVisits.projectId, projects.id))
    .leftJoin(tasks, eq(recentVisits.taskId, tasks.id))
    .where(eq(recentVisits.userId, actorId))
    .orderBy(desc(recentVisits.visitedAt))
    .limit(limit);
}

export async function deleteRecentVisit(actorId: string, visitId: string) {
  await db
    .delete(recentVisits)
    .where(
      and(eq(recentVisits.id, visitId), eq(recentVisits.userId, actorId)),
    );
}
