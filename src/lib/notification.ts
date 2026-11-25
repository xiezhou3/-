import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  projects,
  tasks,
  users,
} from "@/db/schema";

type NotificationType =
  | "task_mention"
  | "task_comment"
  | "task_status"
  | "automation";

export async function createTaskNotifications(input: {
  recipientIds: string[];
  projectId: string;
  taskId: string;
  commentId?: string | null;
  actorId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
}) {
  const recipients = [...new Set(input.recipientIds)].filter(
    (userId) => userId !== input.actorId,
  );
  if (recipients.length === 0) return;
  await db.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      projectId: input.projectId,
      taskId: input.taskId,
      commentId: input.commentId ?? null,
      actorId: input.actorId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
    })),
  );
}

export async function listMyNotifications(actorId: string, limit = 50) {
  return db
    .select({
      id: notifications.id,
      projectId: notifications.projectId,
      projectName: projects.name,
      taskId: notifications.taskId,
      taskTitle: tasks.title,
      actorId: notifications.actorId,
      actorName: users.name,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(projects, eq(notifications.projectId, projects.id))
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .leftJoin(users, eq(notifications.actorId, users.id))
    .where(eq(notifications.userId, actorId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(actorId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, actorId),
        isNull(notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}

export async function markNotificationRead(actorId: string, id: string) {
  await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, actorId),
      ),
    );
}

export async function markAllNotificationsRead(actorId: string) {
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(notifications.userId, actorId),
        isNull(notifications.readAt),
      ),
    );
}
