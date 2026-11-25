import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { db, type DbTx } from "@/db";
import {
  tasks,
  workflowStatuses,
  workflowTransitions,
  type WorkflowStatusCategory,
} from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getProjectForUser } from "./project";

type Executor = DbTx | typeof db;

const DEFAULT_STATUSES: Array<{
  name: string;
  category: WorkflowStatusCategory;
  color: "slate" | "blue" | "green";
  position: number;
  isDefault: boolean;
}> = [
  { name: "待办", category: "todo", color: "slate", position: 1024, isDefault: true },
  { name: "待审核", category: "doing", color: "blue", position: 2048, isDefault: false },
  { name: "已完成", category: "done", color: "green", position: 3072, isDefault: false },
];

const CATEGORIES: WorkflowStatusCategory[] = ["todo", "doing", "done"];

async function requireWorkflowAdmin(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access || access.role !== "admin") throw new ForbiddenError();
  return access;
}

export async function ensureProjectWorkflow(projectId: string) {
  const [existing, missingTaskRows, transitionRows] = await Promise.all([
    db
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.projectId, projectId))
      .orderBy(asc(workflowStatuses.position)),
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.statusId))),
    db
      .select({ value: count() })
      .from(workflowTransitions)
      .where(eq(workflowTransitions.projectId, projectId)),
  ]);
  const hasEveryCategory = CATEGORIES.every((category) =>
    existing.some((status) => status.category === category),
  );
  const hasDefault = existing.some((status) => status.isDefault);
  if (
    existing.length > 0 &&
    hasEveryCategory &&
    hasDefault &&
    (missingTaskRows[0]?.value ?? 0) === 0 &&
    (transitionRows[0]?.value ?? 0) > 0
  ) {
    return existing;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${projectId}))`);
    let statuses = await tx
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.projectId, projectId))
      .orderBy(asc(workflowStatuses.position));

    for (const category of CATEGORIES) {
      if (statuses.some((status) => status.category === category)) continue;
      const preset = DEFAULT_STATUSES.find((item) => item.category === category)!;
      const [created] = await tx
        .insert(workflowStatuses)
        .values({
          projectId,
          ...preset,
          isDefault:
            category === "todo" &&
            !statuses.some((status) => status.isDefault),
        })
        .onConflictDoNothing()
        .returning();
      if (created) statuses.push(created);
    }

    statuses = await tx
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.projectId, projectId))
      .orderBy(asc(workflowStatuses.position));

    if (!statuses.some((status) => status.isDefault) && statuses[0]) {
      await tx
        .update(workflowStatuses)
        .set({ isDefault: true, updatedAt: sql`now()` })
        .where(eq(workflowStatuses.id, statuses[0].id));
      statuses[0] = { ...statuses[0], isDefault: true };
    }

    const transitions = await tx
      .select({ value: count() })
      .from(workflowTransitions)
      .where(eq(workflowTransitions.projectId, projectId));
    if ((transitions[0]?.value ?? 0) === 0) {
      const rows = statuses.flatMap((from) =>
        statuses
          .filter((to) => to.id !== from.id)
          .map((to) => ({
            projectId,
            fromStatusId: from.id,
            toStatusId: to.id,
          })),
      );
      if (rows.length > 0) {
        await tx.insert(workflowTransitions).values(rows).onConflictDoNothing();
      }
    }

    for (const category of CATEGORIES) {
      const target = statuses.find((status) => status.category === category);
      if (!target) continue;
      await tx
        .update(tasks)
        .set({ statusId: target.id })
        .where(
          and(
            eq(tasks.projectId, projectId),
            eq(tasks.status, category),
            isNull(tasks.statusId),
          ),
        );
    }
    return statuses;
  });
}

export async function listWorkflowStatuses(projectId: string) {
  const statuses = await ensureProjectWorkflow(projectId);
  const counts = await db
    .select({
      statusId: tasks.statusId,
      value: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .groupBy(tasks.statusId);
  const byStatus = new Map(counts.map((row) => [row.statusId, row.value]));
  return statuses.map((status) => ({
    ...status,
    taskCount: byStatus.get(status.id) ?? 0,
  }));
}

export async function getProjectWorkflow(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  const [statuses, transitions] = await Promise.all([
    listWorkflowStatuses(projectId),
    db
      .select({
        fromStatusId: workflowTransitions.fromStatusId,
        toStatusId: workflowTransitions.toStatusId,
      })
      .from(workflowTransitions)
      .where(eq(workflowTransitions.projectId, projectId)),
  ]);
  return { statuses, transitions, role: access.role };
}

async function assertStatusNameFree(
  exec: Executor,
  projectId: string,
  name: string,
  excludeId?: string,
) {
  const rows = await exec
    .select({ id: workflowStatuses.id })
    .from(workflowStatuses)
    .where(
      and(
        eq(workflowStatuses.projectId, projectId),
        sql`lower(${workflowStatuses.name}) = lower(${name})`,
      ),
    );
  if (rows.some((row) => row.id !== excludeId)) {
    throw new AppError("状态名称已存在");
  }
}

export async function createWorkflowStatus(
  actorId: string,
  projectId: string,
  input: {
    name: string;
    category: WorkflowStatusCategory;
    color: string;
    wipLimit?: number | null;
  },
) {
  await requireWorkflowAdmin(actorId, projectId);
  await ensureProjectWorkflow(projectId);
  return db.transaction(async (tx) => {
    await assertStatusNameFree(tx, projectId, input.name);
    const statuses = await tx
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.projectId, projectId))
      .orderBy(asc(workflowStatuses.position));
    const position = (statuses.at(-1)?.position ?? 0) + 1024;
    const [created] = await tx
      .insert(workflowStatuses)
      .values({
        projectId,
        name: input.name,
        category: input.category,
        color: input.color as typeof workflowStatuses.$inferInsert.color,
        position,
        wipLimit: input.wipLimit ?? null,
        isDefault: false,
      })
      .returning();
    const rows = statuses.flatMap((status) => [
      { projectId, fromStatusId: status.id, toStatusId: created.id },
      { projectId, fromStatusId: created.id, toStatusId: status.id },
    ]);
    if (rows.length > 0) {
      await tx.insert(workflowTransitions).values(rows).onConflictDoNothing();
    }
    return created;
  });
}

export async function updateWorkflowStatus(
  actorId: string,
  statusId: string,
  patch: {
    name?: string;
    category?: WorkflowStatusCategory;
    color?: string;
    wipLimit?: number | null;
  },
) {
  const [status] = await db
    .select()
    .from(workflowStatuses)
    .where(eq(workflowStatuses.id, statusId));
  if (!status) throw new AppError("工作流状态不存在");
  await requireWorkflowAdmin(actorId, status.projectId);
  return db.transaction(async (tx) => {
    if (patch.name && patch.name !== status.name) {
      await assertStatusNameFree(tx, status.projectId, patch.name, statusId);
    }
    const [updated] = await tx
      .update(workflowStatuses)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.category !== undefined && { category: patch.category }),
        ...(patch.color !== undefined && {
          color: patch.color as typeof workflowStatuses.$inferInsert.color,
        }),
        ...(patch.wipLimit !== undefined && { wipLimit: patch.wipLimit }),
        updatedAt: sql`now()`,
      })
      .where(eq(workflowStatuses.id, statusId))
      .returning();
    if (patch.category && patch.category !== status.category) {
      await tx
        .update(tasks)
        .set({ status: patch.category })
        .where(and(eq(tasks.projectId, status.projectId), eq(tasks.statusId, statusId)));
    }
    return updated;
  });
}

export async function deleteWorkflowStatus(actorId: string, statusId: string) {
  const [status] = await db
    .select()
    .from(workflowStatuses)
    .where(eq(workflowStatuses.id, statusId));
  if (!status) return;
  await requireWorkflowAdmin(actorId, status.projectId);
  if (status.isDefault) throw new AppError("默认状态不可删除");
  const [usage] = await db
    .select({ value: count() })
    .from(tasks)
    .where(eq(tasks.statusId, statusId));
  if ((usage?.value ?? 0) > 0) throw new AppError("状态仍被任务使用，不能删除");

  const siblings = await db
    .select({ id: workflowStatuses.id })
    .from(workflowStatuses)
    .where(
      and(
        eq(workflowStatuses.projectId, status.projectId),
        eq(workflowStatuses.category, status.category),
      ),
    );
  if (siblings.length <= 1) throw new AppError("每个状态类别至少保留一个状态");
  await db.delete(workflowStatuses).where(eq(workflowStatuses.id, statusId));
}

export async function reorderWorkflowStatuses(
  actorId: string,
  projectId: string,
  orderedIds: string[],
) {
  await requireWorkflowAdmin(actorId, projectId);
  const unique = [...new Set(orderedIds)];
  const rows = await db
    .select({ id: workflowStatuses.id })
    .from(workflowStatuses)
    .where(eq(workflowStatuses.projectId, projectId));
  if (rows.length !== unique.length || rows.some((row) => !unique.includes(row.id))) {
    throw new AppError("状态排序数据不完整");
  }
  await db.transaction(async (tx) => {
    for (let index = 0; index < unique.length; index++) {
      await tx
        .update(workflowStatuses)
        .set({ position: (index + 1) * 1024, updatedAt: sql`now()` })
        .where(eq(workflowStatuses.id, unique[index]));
    }
  });
}

export async function setWorkflowTransitions(
  actorId: string,
  projectId: string,
  pairs: Array<{ fromStatusId: string; toStatusId: string }>,
) {
  await requireWorkflowAdmin(actorId, projectId);
  const statuses = await db
    .select({ id: workflowStatuses.id })
    .from(workflowStatuses)
    .where(eq(workflowStatuses.projectId, projectId));
  const validIds = new Set(statuses.map((status) => status.id));
  const normalized = [
    ...new Map(
      pairs
        .filter(
          (pair) =>
            validIds.has(pair.fromStatusId) &&
            validIds.has(pair.toStatusId) &&
            pair.fromStatusId !== pair.toStatusId,
        )
        .map((pair) => [
          `${pair.fromStatusId}:${pair.toStatusId}`,
          pair,
        ]),
    ).values(),
  ];
  await db.transaction(async (tx) => {
    await tx
      .delete(workflowTransitions)
      .where(eq(workflowTransitions.projectId, projectId));
    if (normalized.length > 0) {
      await tx.insert(workflowTransitions).values(
        normalized.map((pair) => ({ projectId, ...pair })),
      );
    }
  });
}

export async function getWorkflowStatusById(
  exec: Executor,
  projectId: string,
  statusId: string,
) {
  const [status] = await exec
    .select()
    .from(workflowStatuses)
    .where(
      and(
        eq(workflowStatuses.id, statusId),
        eq(workflowStatuses.projectId, projectId),
      ),
    );
  if (!status) throw new AppError("工作流状态不属于该项目");
  return status;
}

export async function getWorkflowStatusByCategory(
  exec: Executor,
  projectId: string,
  category: WorkflowStatusCategory,
) {
  const [status] = await exec
    .select()
    .from(workflowStatuses)
    .where(
      and(
        eq(workflowStatuses.projectId, projectId),
        eq(workflowStatuses.category, category),
      ),
    )
    .orderBy(asc(workflowStatuses.position))
    .limit(1);
  if (!status) throw new AppError("工作流缺少可用状态");
  return status;
}

export async function assertTransitionAllowed(
  exec: Executor,
  projectId: string,
  fromStatusId: string | null,
  toStatusId: string,
) {
  if (!fromStatusId || fromStatusId === toStatusId) return;
  const [transition] = await exec
    .select({ fromStatusId: workflowTransitions.fromStatusId })
    .from(workflowTransitions)
    .where(
      and(
        eq(workflowTransitions.projectId, projectId),
        eq(workflowTransitions.fromStatusId, fromStatusId),
        eq(workflowTransitions.toStatusId, toStatusId),
      ),
    );
  if (!transition) throw new AppError("该状态流转未被允许");
}

export async function enforceWipLimit(
  exec: Executor,
  projectId: string,
  targetStatusId: string,
  movingTaskId: string,
) {
  const status = await getWorkflowStatusById(exec, projectId, targetStatusId);
  if (status.wipLimit === null) return;
  const [usage] = await exec
    .select({ value: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.statusId, targetStatusId),
        ne(tasks.id, movingTaskId),
      ),
    );
  if ((usage?.value ?? 0) >= status.wipLimit) {
    throw new AppError(`状态“${status.name}”已达到 WIP 上限 ${status.wipLimit}`);
  }
}

export async function batchUpdateTasks(
  actorId: string,
  projectId: string,
  taskIds: string[],
  patch: {
    statusId?: string;
    priority?: "low" | "medium" | "high";
    assigneeIds?: string[];
  },
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access || !["admin", "student"].includes(access.role)) {
    throw new ForbiddenError();
  }
  const ids = [...new Set(taskIds)];
  if (ids.length === 0) return 0;
  const rows = await db
    .select({
      id: tasks.id,
      statusId: tasks.statusId,
      statusName: workflowStatuses.name,
    })
    .from(tasks)
    .leftJoin(workflowStatuses, eq(tasks.statusId, workflowStatuses.id))
    .where(and(eq(tasks.projectId, projectId), inArray(tasks.id, ids)));
  if (rows.length !== ids.length) throw new AppError("部分任务不属于该项目");

  const { updateTask } = await import("./task");
  const before = new Map(rows.map((row) => [row.id, row]));
  const updatedRows = await db.transaction(async (tx) => {
    const output: Awaited<ReturnType<typeof updateTask>>[] = [];
    for (const id of ids) {
      output.push(await updateTask(actorId, id, patch, { tx }));
    }
    return output;
  });
  if (patch.statusId) {
    const { notifyWatchersOfStatusChange } = await import("./task");
    for (const updated of updatedRows) {
      const previous = before.get(updated.id);
      if (!previous || previous.statusId === updated.statusId) continue;
      const next = await getWorkflowStatusById(db, projectId, updated.statusId!);
      await notifyWatchersOfStatusChange(
        actorId,
        updated,
        previous.statusName ?? updated.status,
        next.name,
      );
    }
  }
  return ids.length;
}
