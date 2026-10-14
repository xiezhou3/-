import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { projectComments, teamMembers, users } from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getProjectForUser } from "./project";

export type ProjectComment = {
  id: string;
  projectId: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  authorRole: "admin" | "teacher" | "student" | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  isDeleted: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type ProjectCommentThread = {
  comment: ProjectComment;
  replies: ProjectComment[];
};

export type ProjectCommentPage = {
  threads: ProjectCommentThread[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: { createdAt: string; id: string } | null;
};

const MAX_COMMENT_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 20;

function normalizeCommentContent(content: string) {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new AppError("评论内容不能为空");
  if (normalized.length > MAX_COMMENT_LENGTH) {
    throw new AppError(`评论最多 ${MAX_COMMENT_LENGTH} 字`);
  }
  return normalized;
}

async function requireProjectCommentAccess(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return access;
}

async function mapComment(
  row: {
    id: string;
    projectId: string;
    parentId: string | null;
    authorId: string | null;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    authorName: string | null;
    authorRole: "admin" | "teacher" | "student" | null;
  },
  actorId: string,
  projectRole: "admin" | "teacher" | "student",
): Promise<ProjectComment> {
  const isDeleted = row.deletedAt !== null;
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    authorId: row.authorId,
    authorName: row.authorName ?? "已注销用户",
    authorRole: row.authorRole,
    content: isDeleted ? "" : row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isEdited: row.updatedAt.getTime() !== row.createdAt.getTime(),
    isDeleted,
    canEdit: !isDeleted && row.authorId === actorId,
    canDelete:
      !isDeleted && (row.authorId === actorId || projectRole === "admin"),
  };
}

async function commentRowsForProject(
  projectId: string,
  teamId: string,
  rootIds: string[],
) {
  if (rootIds.length === 0) return [];
  return db
    .select({
      id: projectComments.id,
      projectId: projectComments.projectId,
      parentId: projectComments.parentId,
      authorId: projectComments.authorId,
      content: projectComments.content,
      createdAt: projectComments.createdAt,
      updatedAt: projectComments.updatedAt,
      deletedAt: projectComments.deletedAt,
      authorName: users.name,
      authorRole: teamMembers.role,
    })
    .from(projectComments)
    .leftJoin(users, eq(projectComments.authorId, users.id))
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.userId, projectComments.authorId),
        eq(teamMembers.teamId, teamId),
      ),
    )
    .where(
      and(
        eq(projectComments.projectId, projectId),
        inArray(projectComments.parentId, rootIds),
        isNull(projectComments.deletedAt),
      ),
    )
    .orderBy(asc(projectComments.createdAt), asc(projectComments.id));
}

export async function listProjectComments(
  actorId: string,
  projectId: string,
  options: {
    limit?: number;
    beforeCreatedAt?: string;
    beforeId?: string;
  } = {},
): Promise<ProjectCommentPage> {
  const access = await requireProjectCommentAccess(actorId, projectId);
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), 50);
  const replyAlias = aliasedTable(projectComments, "visible_reply");
  const visibleRoot = or(
    isNull(projectComments.deletedAt),
    exists(
      db
        .select({ id: replyAlias.id })
        .from(replyAlias)
        .where(
          and(
            eq(replyAlias.parentId, projectComments.id),
            isNull(replyAlias.deletedAt),
          ),
        ),
    ),
  );
  const cursorCondition =
    options.beforeCreatedAt && options.beforeId
      ? or(
          lt(projectComments.createdAt, new Date(options.beforeCreatedAt)),
          and(
            eq(projectComments.createdAt, new Date(options.beforeCreatedAt)),
            lt(projectComments.id, options.beforeId),
          ),
        )
      : undefined;

  const rootRows = await db
    .select({
      id: projectComments.id,
      projectId: projectComments.projectId,
      parentId: projectComments.parentId,
      authorId: projectComments.authorId,
      content: projectComments.content,
      createdAt: projectComments.createdAt,
      updatedAt: projectComments.updatedAt,
      deletedAt: projectComments.deletedAt,
      authorName: users.name,
      authorRole: teamMembers.role,
    })
    .from(projectComments)
    .leftJoin(users, eq(projectComments.authorId, users.id))
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.userId, projectComments.authorId),
        eq(teamMembers.teamId, access.project.teamId),
      ),
    )
    .where(
      and(
        eq(projectComments.projectId, projectId),
        isNull(projectComments.parentId),
        visibleRoot,
        cursorCondition,
      ),
    )
    .orderBy(desc(projectComments.createdAt), desc(projectComments.id))
    .limit(limit + 1);

  const hasMore = rootRows.length > limit;
  const selectedRoots = rootRows.slice(0, limit).reverse();
  const rootIds = selectedRoots.map((row) => row.id);
  const replies = await commentRowsForProject(
    projectId,
    access.project.teamId,
    rootIds,
  );

  const repliesByRoot = new Map<string, ProjectComment[]>();
  for (const reply of replies) {
    if (!reply.parentId) continue;
    const mapped = await mapComment(reply, actorId, access.role);
    const bucket = repliesByRoot.get(reply.parentId) ?? [];
    bucket.push(mapped);
    repliesByRoot.set(reply.parentId, bucket);
  }

  const threads: ProjectCommentThread[] = [];
  for (const root of selectedRoots) {
    threads.push({
      comment: await mapComment(root, actorId, access.role),
      replies: repliesByRoot.get(root.id) ?? [],
    });
  }

  const [rootCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectComments)
    .where(
      and(
        eq(projectComments.projectId, projectId),
        isNull(projectComments.parentId),
        visibleRoot,
      ),
    );
  const [replyCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectComments)
    .where(
      and(
        eq(projectComments.projectId, projectId),
        isNotNull(projectComments.parentId),
        isNull(projectComments.deletedAt),
      ),
    );
  const oldest = selectedRoots[0];

  return {
    threads,
    totalCount: (rootCountRow?.count ?? 0) + (replyCountRow?.count ?? 0),
    hasMore,
    nextCursor:
      hasMore && oldest
        ? { createdAt: oldest.createdAt.toISOString(), id: oldest.id }
        : null,
  };
}

export async function createProjectComment(
  actorId: string,
  projectId: string,
  input: { content: string; parentId?: string | null },
) {
  const access = await requireProjectCommentAccess(actorId, projectId);
  const content = normalizeCommentContent(input.content);

  if (input.parentId) {
    const [parent] = await db
      .select({
        id: projectComments.id,
        parentId: projectComments.parentId,
        deletedAt: projectComments.deletedAt,
      })
      .from(projectComments)
      .where(
        and(
          eq(projectComments.id, input.parentId),
          eq(projectComments.projectId, projectId),
        ),
      );
    if (!parent || parent.deletedAt) throw new AppError("回复的评论不存在");
    if (parent.parentId) throw new AppError("只支持一级回复");
  }

  const [created] = await db
    .insert(projectComments)
    .values({
      projectId,
      authorId: actorId,
      parentId: input.parentId ?? null,
      content,
    })
    .returning();
  const [author] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actorId));
  return mapComment(
    {
      ...created,
      authorName: author?.name ?? "已注销用户",
      authorRole: access.role,
    },
    actorId,
    access.role,
  );
}

async function getCommentWithAccess(actorId: string, commentId: string) {
  const [comment] = await db
    .select()
    .from(projectComments)
    .where(eq(projectComments.id, commentId));
  if (!comment) throw new AppError("评论不存在");
  const access = await getProjectForUser(actorId, comment.projectId);
  if (!access) throw new ForbiddenError();
  return { comment, access };
}

export async function updateProjectComment(
  actorId: string,
  commentId: string,
  contentInput: string,
) {
  const { comment, access } = await getCommentWithAccess(actorId, commentId);
  if (comment.deletedAt) throw new AppError("评论已删除");
  if (comment.authorId !== actorId) throw new ForbiddenError("只能编辑自己的评论");
  const content = normalizeCommentContent(contentInput);
  const [updated] = await db
    .update(projectComments)
    .set({ content, updatedAt: new Date() })
    .where(eq(projectComments.id, commentId))
    .returning();
  const [author] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actorId));
  return mapComment(
    {
      ...updated,
      authorName: author?.name ?? "已注销用户",
      authorRole: access.role,
    },
    actorId,
    access.role,
  );
}

export async function deleteProjectComment(actorId: string, commentId: string) {
  const { comment, access } = await getCommentWithAccess(actorId, commentId);
  if (comment.deletedAt) return;
  const canDelete = comment.authorId === actorId || access.role === "admin";
  if (!canDelete) throw new ForbiddenError("只能删除自己的评论");
  await db
    .update(projectComments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projectComments.id, commentId));
}
