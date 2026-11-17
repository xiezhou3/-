import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  taskAttachments,
  taskReviewRequests,
  tasks,
  teamMembers,
  users,
} from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getProjectForUser } from "./project";
import { getTaskAssigneeIds, getTaskDetail } from "./task";
import { notifyTaskCompleted } from "./notify";
import {
  ensureProjectWorkflow,
  getWorkflowStatusByCategory,
} from "./workflow";
import { triggerTaskStatusAutomation } from "./automation-trigger";

export type PendingTaskReview = {
  id: string;
  taskId: string;
  projectId: string;
  taskTitle: string;
  projectName: string;
  submittedById: string | null;
  submittedByName: string | null;
  submittedAt: Date;
  attachmentsCount: number;
};

async function adminTeamIds(actorId: string) {
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, actorId), eq(teamMembers.role, "admin")));
  return rows.map((row) => row.teamId);
}

export async function listPendingTaskReviewsForAdmin(
  actorId: string,
): Promise<PendingTaskReview[]> {
  const teamIds = await adminTeamIds(actorId);
  if (teamIds.length === 0) return [];

  const rows = await db
    .select({
      id: taskReviewRequests.id,
      taskId: taskReviewRequests.taskId,
      projectId: taskReviewRequests.projectId,
      taskTitle: tasks.title,
      projectName: projects.name,
      submittedById: taskReviewRequests.submittedById,
      submittedByName: users.name,
      submittedAt: taskReviewRequests.submittedAt,
    })
    .from(taskReviewRequests)
    .innerJoin(tasks, eq(taskReviewRequests.taskId, tasks.id))
    .innerJoin(projects, eq(taskReviewRequests.projectId, projects.id))
    .leftJoin(users, eq(taskReviewRequests.submittedById, users.id))
    .where(
      and(
        eq(taskReviewRequests.status, "pending"),
        inArray(projects.teamId, teamIds),
      ),
    )
    .orderBy(asc(taskReviewRequests.submittedAt));

  if (rows.length === 0) return [];
  const attachmentCounts = await db
    .select({
      taskId: taskAttachments.taskId,
      count: sql<number>`count(*)::int`,
    })
    .from(taskAttachments)
    .where(inArray(taskAttachments.taskId, rows.map((row) => row.taskId)))
    .groupBy(taskAttachments.taskId);
  const countByTask = new Map(
    attachmentCounts.map((row) => [row.taskId, row.count]),
  );
  return rows.map((row) => ({
    ...row,
    attachmentsCount: countByTask.get(row.taskId) ?? 0,
  }));
}

export async function countPendingTaskReviewsForAdmin(actorId: string) {
  const teamIds = await adminTeamIds(actorId);
  if (teamIds.length === 0) return 0;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taskReviewRequests)
    .innerJoin(projects, eq(taskReviewRequests.projectId, projects.id))
    .where(
      and(
        eq(taskReviewRequests.status, "pending"),
        inArray(projects.teamId, teamIds),
      ),
    );
  return row?.count ?? 0;
}

export async function getTaskReviewForAdmin(
  actorId: string,
  reviewId: string,
) {
  const [review] = await db
    .select({
      id: taskReviewRequests.id,
      taskId: taskReviewRequests.taskId,
      projectId: taskReviewRequests.projectId,
      status: taskReviewRequests.status,
      submittedAt: taskReviewRequests.submittedAt,
      submittedById: taskReviewRequests.submittedById,
      submittedByName: users.name,
      projectName: projects.name,
      reviewNote: taskReviewRequests.reviewNote,
    })
    .from(taskReviewRequests)
    .innerJoin(projects, eq(taskReviewRequests.projectId, projects.id))
    .leftJoin(users, eq(taskReviewRequests.submittedById, users.id))
    .where(eq(taskReviewRequests.id, reviewId));
  if (!review) throw new AppError("审核记录不存在");

  const access = await getProjectForUser(actorId, review.projectId);
  if (!access || access.role !== "admin") throw new ForbiddenError();
  const task = await getTaskDetail(actorId, review.taskId);
  return { review, task };
}

export async function submitTaskForReview(actorId: string, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError("任务不存在");

  const access = await getProjectForUser(actorId, task.projectId);
  if (!access) throw new ForbiddenError();
  const assigneeIds = await getTaskAssigneeIds(taskId, task.assigneeId);
  if (access.role !== "admin" && !assigneeIds.includes(actorId)) {
    throw new ForbiddenError("只有任务负责人或项目管理员可以提交审核");
  }
  if (task.status !== "todo") throw new AppError("只有待办任务可以提交审核");

  const [attachmentCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taskAttachments)
    .where(eq(taskAttachments.taskId, taskId));
  if (!attachmentCount?.count) throw new AppError("请先添加至少一个文件链接");

  const updated = await db.transaction(async (tx) => {
    await ensureProjectWorkflow(task.projectId);
    const inProgress = await getWorkflowStatusByCategory(
      tx,
      task.projectId,
      "doing",
    );
    const now = sql`now()`;
    await tx
      .insert(taskReviewRequests)
      .values({
        taskId,
        projectId: task.projectId,
        submittedById: actorId,
        status: "pending",
        submittedAt: now,
      })
      .onConflictDoUpdate({
        target: taskReviewRequests.taskId,
        set: {
          submittedById: actorId,
          status: "pending",
          submittedAt: now,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          updatedAt: now,
        },
      });
    const [updated] = await tx
      .update(tasks)
      .set({ status: "doing", statusId: inProgress.id, updatedAt: now })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated;
  });
  await triggerTaskStatusAutomation({
    actorId,
    projectId: task.projectId,
    taskId: task.id,
    taskTitle: task.title,
    workItemType: task.workItemType,
    priority: task.priority,
    fromStatus: "todo",
    toStatus: "doing",
  });
  return updated;
}

export async function approveTaskReview(actorId: string, reviewId: string) {
  const { review } = await getTaskReviewForAdmin(actorId, reviewId);
  if (review.status !== "pending") throw new AppError("该审核已处理");

  const updatedTask = await db.transaction(async (tx) => {
    await ensureProjectWorkflow(review.projectId);
    const done = await getWorkflowStatusByCategory(
      tx,
      review.projectId,
      "done",
    );
    const now = sql`now()`;
    await tx
      .update(taskReviewRequests)
      .set({
        status: "approved",
        reviewedById: actorId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(taskReviewRequests.id, reviewId));
    const [updated] = await tx
      .update(tasks)
      .set({ status: "done", statusId: done.id, updatedAt: now })
      .where(eq(tasks.id, review.taskId))
      .returning();
    return updated;
  });

  void notifyTaskCompleted(updatedTask, actorId);
  await triggerTaskStatusAutomation({
    actorId,
    projectId: updatedTask.projectId,
    taskId: updatedTask.id,
    taskTitle: updatedTask.title,
    workItemType: updatedTask.workItemType,
    priority: updatedTask.priority,
    fromStatus: "doing",
    toStatus: "done",
  });
  return updatedTask;
}

export async function rejectTaskReview(
  actorId: string,
  reviewId: string,
  note: string,
) {
  const { review, task } = await getTaskReviewForAdmin(actorId, reviewId);
  if (review.status !== "pending") throw new AppError("该审核已处理");
  const reviewNote = note.trim().slice(0, 500);

  await db.transaction(async (tx) => {
    await ensureProjectWorkflow(review.projectId);
    const todo = await getWorkflowStatusByCategory(
      tx,
      review.projectId,
      "todo",
    );
    const now = sql`now()`;
    await tx
      .update(taskReviewRequests)
      .set({
        status: "rejected",
        reviewedById: actorId,
        reviewedAt: now,
        reviewNote: reviewNote || null,
        updatedAt: now,
      })
      .where(eq(taskReviewRequests.id, reviewId));
    await tx
      .update(tasks)
      .set({ status: "todo", statusId: todo.id, updatedAt: now })
      .where(eq(tasks.id, review.taskId));
  });
  await triggerTaskStatusAutomation({
    actorId,
    projectId: review.projectId,
    taskId: review.taskId,
    taskTitle: task.title,
    workItemType: task.workItemType,
    priority: task.priority,
    fromStatus: "doing",
    toStatus: "todo",
  });
}
