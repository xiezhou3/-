import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projectFiles,
  taskCommentAttachments,
  taskCommentMentions,
  taskComments,
  taskWatchers,
  tasks,
  users,
} from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getProjectForUser } from "./project";
import { listTeamMembers } from "./team";
import { createTaskNotifications } from "./notification";

async function taskAccess(actorId: string, taskId: string) {
  const [task] = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      statusId: tasks.statusId,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assigneeId,
      priority: tasks.priority,
      createdById: tasks.createdById,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task) throw new AppError("任务不存在");
  const access = await getProjectForUser(actorId, task.projectId);
  if (!access) throw new ForbiddenError();
  return { task, access };
}

export async function listTaskCollaboration(actorId: string, taskId: string) {
  const { task, access } = await taskAccess(actorId, taskId);
  const comments = await db
    .select({
      id: taskComments.id,
      parentId: taskComments.parentId,
      authorId: taskComments.authorId,
      authorName: users.name,
      content: taskComments.content,
      createdAt: taskComments.createdAt,
      updatedAt: taskComments.updatedAt,
      deletedAt: taskComments.deletedAt,
    })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.authorId, users.id))
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt));

  const commentIds = comments.map((comment) => comment.id);
  const [attachments, mentions, watchers] = await Promise.all([
    commentIds.length > 0
      ? db
          .select()
          .from(taskCommentAttachments)
          .where(inArray(taskCommentAttachments.commentId, commentIds))
          .orderBy(asc(taskCommentAttachments.createdAt))
      : Promise.resolve([]),
    commentIds.length > 0
      ? db
          .select({ commentId: taskCommentMentions.commentId, userId: taskCommentMentions.userId })
          .from(taskCommentMentions)
          .where(inArray(taskCommentMentions.commentId, commentIds))
      : Promise.resolve([]),
    db
      .select({ userId: taskWatchers.userId })
      .from(taskWatchers)
      .where(eq(taskWatchers.taskId, taskId)),
  ]);

  return {
    task: { id: task.id, title: task.title },
    role: access.role,
    comments: comments.map((comment) => ({
      ...comment,
      content: comment.deletedAt ? "" : comment.content,
      attachments: attachments
        .filter((attachment) => attachment.commentId === comment.id)
        .map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          url: attachment.url,
        })),
      mentionIds: mentions
        .filter((mention) => mention.commentId === comment.id)
        .map((mention) => mention.userId),
    })),
    watcherIds: watchers.map((watcher) => watcher.userId),
    isWatching: watchers.some((watcher) => watcher.userId === actorId),
  };
}

export async function createTaskComment(
  actorId: string,
  taskId: string,
  input: {
    content: string;
    parentId?: string | null;
    mentionIds?: string[];
    projectFileIds?: string[];
  },
) {
  const { task, access } = await taskAccess(actorId, taskId);
  const content = input.content.trim();
  if (!content) throw new AppError("评论内容不能为空");
  if (content.length > 2000) throw new AppError("评论最多 2000 字");

  let parentId = input.parentId ?? null;
  let parentAuthorId: string | null = null;
  if (parentId) {
    const [parent] = await db
      .select({
        id: taskComments.id,
        taskId: taskComments.taskId,
        parentId: taskComments.parentId,
        authorId: taskComments.authorId,
      })
      .from(taskComments)
      .where(eq(taskComments.id, parentId));
    if (!parent || parent.taskId !== taskId) {
      throw new AppError("回复的评论不存在");
    }
    parentId = parent.parentId ?? parent.id;
    parentAuthorId = parent.authorId;
  }

  const members = await listTeamMembers(access.project.teamId);
  const memberIds = new Set(members.map((member) => member.id));
  const mentionIds = [
    ...new Set((input.mentionIds ?? []).filter((id) => memberIds.has(id))),
  ];
  const fileIds = [...new Set(input.projectFileIds ?? [])];
  const files =
    fileIds.length > 0
      ? await db
          .select({
            id: projectFiles.id,
            name: projectFiles.name,
            projectId: projectFiles.projectId,
            status: projectFiles.status,
          })
          .from(projectFiles)
          .where(inArray(projectFiles.id, fileIds))
      : [];
  if (
    files.length !== fileIds.length ||
    files.some((file) => file.projectId !== task.projectId || file.status !== "ready")
  ) {
    throw new AppError("评论附件无效");
  }

  const comment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(taskComments)
      .values({
        taskId,
        projectId: task.projectId,
        authorId: actorId,
        parentId,
        content,
      })
      .returning();
    if (files.length > 0) {
      await tx.insert(taskCommentAttachments).values(
        files.map((file) => ({
          commentId: created.id,
          projectFileId: file.id,
          name: file.name,
          url: `/projects/${task.projectId}/files/${file.id}/view`,
        })),
      );
    }
    if (mentionIds.length > 0) {
      await tx.insert(taskCommentMentions).values(
        mentionIds.map((userId) => ({ commentId: created.id, userId })),
      );
    }
    const autoWatch = [
      actorId,
      ...mentionIds,
      ...(parentAuthorId ? [parentAuthorId] : []),
    ];
    if (autoWatch.length > 0) {
      await tx
        .insert(taskWatchers)
        .values(autoWatch.map((userId) => ({ taskId, userId })))
        .onConflictDoNothing();
    }
    return created;
  });

  const watchers = await db
    .select({ userId: taskWatchers.userId })
    .from(taskWatchers)
    .where(eq(taskWatchers.taskId, taskId));
  const recipientIds = [
    ...new Set([
      ...watchers.map((watcher) => watcher.userId),
      ...mentionIds,
      ...(parentAuthorId ? [parentAuthorId] : []),
    ]),
  ].filter((userId) => userId !== actorId);
  if (recipientIds.length > 0) {
    const mentionedRecipients = recipientIds.filter((id) =>
      mentionIds.includes(id),
    );
    const otherRecipients = recipientIds.filter(
      (id) => !mentionIds.includes(id),
    );
    if (mentionedRecipients.length > 0) {
      await createTaskNotifications({
        recipientIds: mentionedRecipients,
        projectId: task.projectId,
        taskId,
        commentId: comment.id,
        actorId,
        type: "task_mention",
        title: `有人提及你：${task.title}`,
        body: content.slice(0, 160),
      });
    }
    if (otherRecipients.length > 0) {
      await createTaskNotifications({
        recipientIds: otherRecipients,
        projectId: task.projectId,
        taskId,
        commentId: comment.id,
        actorId,
        type: "task_comment",
        title: `任务新评论：${task.title}`,
        body: content.slice(0, 160),
      });
    }
    const { notifyTaskComment } = await import("./notify");
    void notifyTaskComment(task, actorId, content, recipientIds);
  }
  return comment;
}

export async function updateTaskComment(
  actorId: string,
  commentId: string,
  content: string,
) {
  const normalized = content.trim();
  if (!normalized) throw new AppError("评论内容不能为空");
  const [comment] = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.id, commentId));
  if (!comment || comment.deletedAt) throw new AppError("评论不存在");
  if (comment.authorId !== actorId) throw new ForbiddenError("只能编辑自己的评论");
  const [updated] = await db
    .update(taskComments)
    .set({ content: normalized, updatedAt: sql`now()` })
    .where(eq(taskComments.id, commentId))
    .returning();
  return updated;
}

export async function deleteTaskComment(actorId: string, commentId: string) {
  const [comment] = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.id, commentId));
  if (!comment || comment.deletedAt) return;
  const access = await getProjectForUser(actorId, comment.projectId);
  if (!access) throw new ForbiddenError();
  if (comment.authorId !== actorId && access.role !== "admin") {
    throw new ForbiddenError("只能删除自己的评论");
  }
  await db
    .update(taskComments)
    .set({ deletedAt: sql`now()` })
    .where(eq(taskComments.id, commentId));
}

export async function setTaskWatching(
  actorId: string,
  taskId: string,
  watching: boolean,
) {
  await taskAccess(actorId, taskId);
  if (watching) {
    await db
      .insert(taskWatchers)
      .values({ taskId, userId: actorId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(taskWatchers)
      .where(
        and(
          eq(taskWatchers.taskId, taskId),
          eq(taskWatchers.userId, actorId),
        ),
      );
  }
}

export async function taskCommentSummary(
  actorId: string,
  projectId: string,
  taskIds: string[],
) {
  if (taskIds.length === 0) {
    return { counts: new Map<string, number>(), mentions: new Set<string>() };
  }
  const [counts, mentions] = await Promise.all([
    db
      .select({
        taskId: taskComments.taskId,
        count: sql<number>`count(*)::int`,
      })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.projectId, projectId),
          isNull(taskComments.deletedAt),
          inArray(taskComments.taskId, taskIds),
        ),
      )
      .groupBy(taskComments.taskId),
    db
      .select({ taskId: taskComments.taskId })
      .from(taskCommentMentions)
      .innerJoin(taskComments, eq(taskCommentMentions.commentId, taskComments.id))
      .where(
        and(
          eq(taskCommentMentions.userId, actorId),
          isNull(taskComments.deletedAt),
          inArray(taskComments.taskId, taskIds),
        ),
      ),
  ]);
  return {
    counts: new Map(counts.map((row) => [row.taskId, row.count])),
    mentions: new Set(mentions.map((row) => row.taskId)),
  };
}
