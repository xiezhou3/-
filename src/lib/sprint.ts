import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  sprints,
  tasks,
  type SprintStatus,
} from "@/db/schema";
import {
  AppError,
  ForbiddenError,
  isUniqueViolation,
} from "./errors";
import { getProjectForUser } from "./project";

const SPRINT_WRITE_ROLES = ["admin", "student"];

export type SprintSummary = typeof sprints.$inferSelect & {
  taskCount: number;
  doneTaskCount: number;
  estimateTotal: number;
  completedEstimate: number;
  unestimatedTaskCount: number;
};

async function requireSprintWrite(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access || !SPRINT_WRITE_ROLES.includes(access.role)) {
    throw new ForbiddenError();
  }
  return access;
}

function normalizeSprintInput(input: {
  name: string;
  goal?: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
}) {
  const name = input.name.trim();
  const goal = input.goal?.trim() || null;
  if (!name) throw new AppError("请填写迭代名称");
  if (name.length > 120) throw new AppError("迭代名称最多 120 字");
  if (input.endDate < input.startDate) {
    throw new AppError("结束日期不能早于开始日期");
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 0) {
    throw new AppError("容量必须是非负整数");
  }
  return {
    name,
    goal,
    startDate: input.startDate,
    endDate: input.endDate,
    capacity: input.capacity,
  };
}

export async function listProjectSprints(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();

  const rows = await db
    .select()
    .from(sprints)
    .where(eq(sprints.projectId, projectId))
    .orderBy(
      sql`case ${sprints.status} when 'active' then 0 when 'planned' then 1 else 2 end`,
      asc(sprints.startDate),
      desc(sprints.closedAt),
    );

  const stats = await db
    .select({
      sprintId: tasks.sprintId,
      taskCount: sql<number>`count(*)::int`,
      doneTaskCount: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      estimateTotal: sql<number>`coalesce(sum(${tasks.estimate}), 0)::int`,
      completedEstimate: sql<number>`coalesce(sum(case when ${tasks.status} = 'done' then ${tasks.estimate} else 0 end), 0)::int`,
      unestimatedTaskCount: sql<number>`count(*) filter (where ${tasks.estimate} is null)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        isNotNull(tasks.sprintId),
      ),
    )
    .groupBy(tasks.sprintId);

  const bySprint = new Map(stats.map((row) => [row.sprintId, row]));
  return rows.map((sprint): SprintSummary => {
    const stat = bySprint.get(sprint.id);
    return {
      ...sprint,
      taskCount: stat?.taskCount ?? 0,
      doneTaskCount: stat?.doneTaskCount ?? 0,
      estimateTotal: stat?.estimateTotal ?? 0,
      completedEstimate: stat?.completedEstimate ?? 0,
      unestimatedTaskCount: stat?.unestimatedTaskCount ?? 0,
    };
  });
}

export async function getActiveSprint(actorId: string, projectId: string) {
  const list = await listProjectSprints(actorId, projectId);
  return list.find((sprint) => sprint.status === "active") ?? null;
}

export async function createSprint(
  actorId: string,
  projectId: string,
  input: {
    name: string;
    goal?: string | null;
    startDate: string;
    endDate: string;
    capacity: number;
  },
) {
  await requireSprintWrite(actorId, projectId);
  const data = normalizeSprintInput(input);
  const [sprint] = await db
    .insert(sprints)
    .values({
      projectId,
      createdById: actorId,
      ...data,
    })
    .returning();
  return sprint;
}

export async function updateSprint(
  actorId: string,
  sprintId: string,
  patch: {
    name?: string;
    goal?: string | null;
    startDate?: string;
    endDate?: string;
    capacity?: number;
  },
) {
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  if (!sprint) throw new AppError("迭代不存在");
  await requireSprintWrite(actorId, sprint.projectId);

  if (sprint.status === "closed") {
    throw new AppError("已关闭的迭代不可修改");
  }
  if (
    sprint.status === "active" &&
    ((patch.name !== undefined && patch.name.trim() !== sprint.name) ||
      (patch.startDate !== undefined && patch.startDate !== sprint.startDate) ||
      (patch.endDate !== undefined && patch.endDate !== sprint.endDate))
  ) {
    throw new AppError("进行中的迭代只能修改目标和容量");
  }

  const next = normalizeSprintInput({
    name: patch.name ?? sprint.name,
    goal: patch.goal !== undefined ? patch.goal : sprint.goal,
    startDate: patch.startDate ?? sprint.startDate,
    endDate: patch.endDate ?? sprint.endDate,
    capacity: patch.capacity ?? sprint.capacity,
  });

  const isActive = sprint.status === "active";
  const [updated] = await db
    .update(sprints)
    .set({
      ...(!isActive && patch.name !== undefined && { name: next.name }),
      ...(patch.goal !== undefined && { goal: next.goal }),
      ...(!isActive && patch.startDate !== undefined && { startDate: next.startDate }),
      ...(!isActive && patch.endDate !== undefined && { endDate: next.endDate }),
      ...(patch.capacity !== undefined && { capacity: next.capacity }),
      updatedAt: sql`now()`,
    })
    .where(eq(sprints.id, sprintId))
    .returning();
  return updated;
}

export async function startSprint(actorId: string, sprintId: string) {
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  if (!sprint) throw new AppError("迭代不存在");
  await requireSprintWrite(actorId, sprint.projectId);
  if (sprint.status !== "planned") {
    throw new AppError("只有计划中的迭代可以启动");
  }

  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(sprints)
        .set({
          status: "active",
          startedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(sprints.id, sprintId),
            eq(sprints.status, "planned"),
          ),
        )
        .returning();
      if (!updated) throw new AppError("迭代状态已变化，请刷新后重试");
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("该项目已有进行中的迭代");
    }
    throw error;
  }
}

export type CloseSprintDestination =
  | { type: "backlog" }
  | { type: "sprint"; targetSprintId: string };

export async function closeSprint(
  actorId: string,
  sprintId: string,
  destination: CloseSprintDestination,
) {
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  if (!sprint) throw new AppError("迭代不存在");
  await requireSprintWrite(actorId, sprint.projectId);
  if (sprint.status !== "active") {
    throw new AppError("只有进行中的迭代可以关闭");
  }

  let targetSprintId: string | null = null;
  if (destination.type === "sprint") {
    const [target] = await db
      .select({
        id: sprints.id,
        status: sprints.status,
        projectId: sprints.projectId,
      })
      .from(sprints)
      .where(eq(sprints.id, destination.targetSprintId));
    if (!target || target.id === sprintId) {
      throw new AppError("目标迭代不存在");
    }
    if (target.projectId !== sprint.projectId) {
      throw new AppError("目标迭代不属于该项目");
    }
    if (target.status !== "planned") {
      throw new AppError("只能顺延到计划中的迭代");
    }
    targetSprintId = target.id;
  }

  return db.transaction(async (tx) => {
    const moved = await tx
      .update(tasks)
      .set({
        sprintId: targetSprintId,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(tasks.sprintId, sprintId),
          ne(tasks.status, "done"),
        ),
      )
      .returning({ id: tasks.id });

    const [closed] = await tx
      .update(sprints)
      .set({
        status: "closed",
        closedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(sprints.id, sprintId),
          eq(sprints.status, "active"),
        ),
      )
      .returning();
    if (!closed) throw new AppError("迭代状态已变化，请刷新后重试");
    return { sprint: closed, movedTaskCount: moved.length };
  });
}

export async function assertSprintAssignable(
  projectId: string,
  sprintId: string,
) {
  const [sprint] = await db
    .select({
      id: sprints.id,
      projectId: sprints.projectId,
      status: sprints.status,
    })
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  if (!sprint || sprint.projectId !== projectId) {
    throw new AppError("迭代不属于该项目");
  }
  if (sprint.status === "closed") {
    throw new AppError("不能把任务加入已关闭的迭代");
  }
  return sprint;
}

export async function isSprintClosed(sprintId: string) {
  const [sprint] = await db
    .select({ status: sprints.status })
    .from(sprints)
    .where(eq(sprints.id, sprintId));
  return sprint?.status === "closed";
}

export async function assignTasksToSprint(
  actorId: string,
  projectId: string,
  taskIds: string[],
  sprintId: string | null,
) {
  await requireSprintWrite(actorId, projectId);
  const uniqueTaskIds = [...new Set(taskIds.filter(Boolean))];
  if (uniqueTaskIds.length === 0) return 0;
  if (sprintId) await assertSprintAssignable(projectId, sprintId);

  const rows = await db
    .select({ id: tasks.id, sprintId: tasks.sprintId })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        inArray(tasks.id, uniqueTaskIds),
      ),
    );
  if (rows.length !== uniqueTaskIds.length) {
    throw new AppError("部分任务不属于该项目");
  }

  const currentSprintIds = [
    ...new Set(
      rows
        .map((task) => task.sprintId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (currentSprintIds.length > 0) {
    const closedRows = await db
      .select({ id: sprints.id })
      .from(sprints)
      .where(
        and(
          inArray(sprints.id, currentSprintIds),
          eq(sprints.status, "closed"),
        ),
      );
    if (closedRows.length > 0) {
      throw new AppError("已关闭迭代中的任务不能重新规划");
    }
  }

  const updated = await db
    .update(tasks)
    .set({ sprintId, updatedAt: sql`now()` })
    .where(inArray(tasks.id, uniqueTaskIds))
    .returning({ id: tasks.id });
  return updated.length;
}

export async function listSprintStatuses(projectId: string) {
  return db
    .select({ id: sprints.id, status: sprints.status })
    .from(sprints)
    .where(eq(sprints.projectId, projectId));
}

export type SprintStatusValue = SprintStatus;
