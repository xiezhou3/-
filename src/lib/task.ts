import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTx } from "@/db";
import {
  labels,
  milestones,
  projectFiles,
  projects,
  releases,
  taskAssignees,
  taskAttachments,
  taskDependencies,
  taskLabels,
  taskWorkLogs,
  taskWatchers,
  tasks,
  users,
  workflowStatuses,
  type BugSeverity,
  type TaskPriority,
  type TaskStatus,
  type WorkItemType,
} from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getTeamMembership } from "./team";
import { getProjectForUser } from "./project";
import {
  notifyTaskAssigned,
  notifyTaskCompleted,
  notifyTaskStatusChanged,
} from "./notify";
import { createTaskNotifications } from "./notification";
import { taskCommentSummary } from "./task-collaboration";
import { assertSprintAssignable, isSprintClosed } from "./sprint";
import { triggerTaskStatusAutomation } from "./automation-trigger";
import {
  assertTransitionAllowed,
  enforceWipLimit,
  ensureProjectWorkflow,
  getWorkflowStatusByCategory,
  getWorkflowStatusById,
} from "./workflow";

// 任务写操作角色：admin + student（teacher 只读，设计文档 §5）
const TASK_WRITE_ROLES = ["admin", "student"];
type Executor = DbTx | typeof db;

export type TaskAssignee = { id: string; name: string };
export type TaskAttachment = {
  id: string;
  projectFileId: string | null;
  name: string;
  url: string;
  createdById: string | null;
  createdByName: string | null;
  createdAt: Date;
};

async function requireProjectAccess(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return access;
}

// 供 lib/label.ts 复用：贴标签属任务写操作，权限口径须与 createTask/updateTask 一致
export async function requireTaskWrite(actorId: string, projectId: string) {
  const access = await requireProjectAccess(actorId, projectId);
  if (!TASK_WRITE_ROLES.includes(access.role)) throw new ForbiddenError();
  return access;
}

async function validateAssignee(teamId: string, assigneeId: string) {
  const membership = await getTeamMembership(assigneeId, teamId);
  if (!membership) throw new AppError("负责人不是团队成员");
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

async function validateAssignees(teamId: string, assigneeIds: string[]) {
  for (const assigneeId of uniqueIds(assigneeIds)) {
    await validateAssignee(teamId, assigneeId);
  }
}

async function validateMilestone(projectId: string, milestoneId: string) {
  const [m] = await db
    .select({ id: milestones.id })
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)));
  if (!m) throw new AppError("里程碑不属于该项目");
}

async function validateRelease(projectId: string, releaseId: string) {
  const [release] = await db
    .select({ id: releases.id })
    .from(releases)
    .where(and(eq(releases.id, releaseId), eq(releases.projectId, projectId)));
  if (!release) throw new AppError("版本不属于该项目");
}

function validateEstimate(estimate: number | null | undefined) {
  if (
    estimate !== undefined &&
    estimate !== null &&
    (!Number.isInteger(estimate) || estimate < 0)
  ) {
    throw new AppError("故事点必须是非负整数");
  }
}

function validateEstimatedHours(hours: number | null | undefined) {
  if (
    hours !== undefined &&
    hours !== null &&
    (!Number.isFinite(hours) || hours < 0)
  ) {
    throw new AppError("预估工时必须是非负数");
  }
}

async function backfillProjectTaskNumbers(
  exec: Executor,
  projectId: string,
) {
  await exec.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`task-number:${projectId}`}))`,
  );
  const [[current], [project]] = await Promise.all([
    exec
      .select({
        maxNumber: sql<number>`coalesce(max(${tasks.taskNumber}), 0)::int`,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId)),
    exec
      .select({ taskSequence: projects.taskSequence })
      .from(projects)
      .where(eq(projects.id, projectId)),
  ]);
  const startNumber = Math.max(
    current?.maxNumber ?? 0,
    project?.taskSequence ?? 0,
  );
  await exec.execute(sql`
    with numbered as (
      select
        id,
        row_number() over (order by created_at, id) + ${startNumber} as next_number
      from tasks
      where project_id = ${projectId} and task_number is null
    )
    update tasks
    set task_number = numbered.next_number
    from numbered
    where tasks.id = numbered.id
  `);
  const [after] = await exec
    .select({
      maxNumber: sql<number>`coalesce(max(${tasks.taskNumber}), 0)::int`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  await exec
    .update(projects)
    .set({
      taskSequence: sql`greatest(${projects.taskSequence}, ${after?.maxNumber ?? 0})`,
    })
    .where(eq(projects.id, projectId));
}

export async function ensureProjectTaskNumbers(projectId: string) {
  await db.transaction(async (tx) => {
    await backfillProjectTaskNumbers(tx, projectId);
  });
}

// 父任务须存在且同项目——防跨项目挂载
async function validateParentTask(projectId: string, parentTaskId: string) {
  const [p] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, parentTaskId), eq(tasks.projectId, projectId)));
  if (!p) throw new AppError("父任务不属于该项目");
}

function requiredWorkItemParentType(childType: WorkItemType) {
  if (childType === "story") return "epic" as const;
  if (childType === "task" || childType === "bug") return "story" as const;
  return null;
}

async function validateWorkItemParent(
  projectId: string,
  childType: WorkItemType,
  parentWorkItemId: string | null | undefined,
) {
  if (!parentWorkItemId) {
    if (childType === "epic") return;
    return;
  }
  if (childType === "epic") {
    throw new AppError("Epic 不能设置父工作项");
  }

  const [parent] = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      workItemType: tasks.workItemType,
    })
    .from(tasks)
    .where(eq(tasks.id, parentWorkItemId));
  if (!parent || parent.projectId !== projectId) {
    throw new AppError("父工作项不属于该项目");
  }

  const expectedParentType = requiredWorkItemParentType(childType);
  if (parent.workItemType !== expectedParentType) {
    if (childType === "story") {
      throw new AppError("Story 的父工作项必须是 Epic");
    }
    throw new AppError(`${childType === "bug" ? "Bug" : "Task"} 的父工作项必须是 Story`);
  }
}

async function validateWorkItemTypeChange(
  taskId: string,
  nextType: WorkItemType,
) {
  const children = await db
    .select({ id: tasks.id, workItemType: tasks.workItemType })
    .from(tasks)
    .where(eq(tasks.parentWorkItemId, taskId));

  for (const child of children) {
    const expected = requiredWorkItemParentType(child.workItemType);
    if (expected !== nextType) {
      throw new AppError("现有下级工作项与目标类型不兼容，请先调整下级");
    }
  }
}

export async function notifyWatchersOfStatusChange(
  actorId: string,
  task: typeof tasks.$inferSelect,
  fromStatus: string,
  toStatus: string,
) {
  const watchers = await db
    .select({ userId: taskWatchers.userId })
    .from(taskWatchers)
    .where(eq(taskWatchers.taskId, task.id));
  const recipientIds = watchers
    .map((watcher) => watcher.userId)
    .filter((userId) => userId !== actorId);
  if (recipientIds.length === 0) return;
  await createTaskNotifications({
    recipientIds,
    projectId: task.projectId,
    taskId: task.id,
    actorId,
    type: "task_status",
    title: `任务状态变更：${task.title}`,
    body: `${fromStatus} → ${toStatus}`,
  });
  void notifyTaskStatusChanged(
    task,
    actorId,
    fromStatus,
    toStatus,
    recipientIds,
  );
}

export async function createTask(
  actorId: string,
  projectId: string,
  input: {
    title: string;
    workItemType?: WorkItemType;
    bugSeverity?: BugSeverity;
    parentWorkItemId?: string;
    description?: string;
    assigneeId?: string;
    assigneeIds?: string[];
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
    sprintId?: string;
    releaseId?: string;
    priority?: TaskPriority;
    estimate?: number;
    estimatedHours?: number;
    backlogRank?: number;
    status?: TaskStatus;
    statusId?: string;
    parentTaskId?: string;
  },
  opts?: { tx?: DbTx },
) {
  const access = await requireTaskWrite(actorId, projectId);
  await ensureProjectWorkflow(projectId);
  const assigneeIds = uniqueIds(
    input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : []),
  );
  await validateAssignees(access.project.teamId, assigneeIds);
  if (input.milestoneId) await validateMilestone(projectId, input.milestoneId);
  if (input.sprintId) await assertSprintAssignable(projectId, input.sprintId);
  if (input.releaseId) await validateRelease(projectId, input.releaseId);
  validateEstimate(input.estimate);
  validateEstimatedHours(input.estimatedHours);
  if (input.parentTaskId) await validateParentTask(projectId, input.parentTaskId);
  const workItemType = input.workItemType ?? "task";
  if (input.bugSeverity && workItemType !== "bug") {
    throw new AppError("只有 Bug 可以设置严重程度");
  }
  await validateWorkItemParent(
    projectId,
    workItemType,
    input.parentWorkItemId,
  );
  const targetStatus = input.statusId
    ? await getWorkflowStatusById(db, projectId, input.statusId)
    : await getWorkflowStatusByCategory(
        db,
        projectId,
        input.status ?? "todo",
      );

  const insertTask = async (exec: DbTx | typeof db) => {
    await backfillProjectTaskNumbers(exec, projectId);
    const [sequence] = await exec
      .update(projects)
      .set({ taskSequence: sql`${projects.taskSequence} + 1` })
      .where(eq(projects.id, projectId))
      .returning({ value: projects.taskSequence });
    let backlogRank = input.backlogRank;
    if (backlogRank === undefined) {
      const [rank] = await exec
        .select({
          maxRank: sql<number>`coalesce(max(${tasks.backlogRank}), 0)`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, projectId),
            input.sprintId
              ? eq(tasks.sprintId, input.sprintId)
              : sql`${tasks.sprintId} is null`,
          ),
        );
      backlogRank = (rank?.maxRank ?? 0) + 1024;
    }
    const [task] = await exec
      .insert(tasks)
      .values({
        taskNumber: sequence.value,
        projectId,
        createdById: actorId,
        title: input.title,
        workItemType,
        bugSeverity: input.bugSeverity,
        parentWorkItemId: input.parentWorkItemId,
        description: input.description,
        assigneeId: assigneeIds[0] ?? null,
        startDate: input.startDate,
        dueDate: input.dueDate,
        milestoneId: input.milestoneId,
        sprintId: input.sprintId,
        releaseId: input.releaseId,
        parentTaskId: input.parentTaskId,
        priority: input.priority ?? "medium",
        estimate: input.estimate,
        estimatedHours: input.estimatedHours,
        backlogRank,
        status: targetStatus.category,
        statusId: targetStatus.id,
        sortOrder: Date.now(),
      })
      .returning();
    if (assigneeIds.length > 0) {
      await exec.insert(taskAssignees).values(
        assigneeIds.map((userId, position) => ({
          taskId: task.id,
          userId,
          position,
        })),
      );
    }
    return task;
  };

  const task = opts?.tx
    ? await insertTask(opts.tx)
    : await db.transaction(insertTask);

  // 非事务路径：即时通知（fire-and-forget，通知内部已吞异常）。事务路径由调用方提交后补发。
  if (!opts?.tx) {
    for (const assigneeId of assigneeIds) {
      void notifyTaskAssigned({ ...task, assigneeId });
    }
  }
  return task;
}

export async function updateTask(
  actorId: string,
  taskId: string,
  patch: {
    title?: string;
    workItemType?: WorkItemType;
    bugSeverity?: BugSeverity | null;
    parentWorkItemId?: string | null;
    description?: string | null;
    assigneeId?: string | null;
    assigneeIds?: string[];
    startDate?: string | null;
    dueDate?: string | null;
    milestoneId?: string | null;
    sprintId?: string | null;
    releaseId?: string | null;
    status?: TaskStatus;
    statusId?: string;
    priority?: TaskPriority;
    estimate?: number | null;
    estimatedHours?: number | null;
    completionNote?: string | null;
  },
  opts?: { tx?: DbTx },
) {
  const query = opts?.tx ?? db;
  const [task] = await query.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError("任务不存在");

  const access = await requireTaskWrite(actorId, task.projectId);
  await ensureProjectWorkflow(task.projectId);
  const hasAssigneePatch =
    patch.assigneeIds !== undefined || patch.assigneeId !== undefined;
  const nextAssigneeIds = hasAssigneePatch
    ? uniqueIds(
        patch.assigneeIds ??
          (patch.assigneeId ? [patch.assigneeId] : []),
      )
    : undefined;
  const previousAssigneeIds =
    nextAssigneeIds !== undefined
      ? await getTaskAssigneeIds(task.id, task.assigneeId)
      : [];
  if (nextAssigneeIds) {
    await validateAssignees(access.project.teamId, nextAssigneeIds);
  }
  if (patch.milestoneId) await validateMilestone(task.projectId, patch.milestoneId);
  if (patch.sprintId) {
    await assertSprintAssignable(task.projectId, patch.sprintId);
  }
  if (patch.releaseId) await validateRelease(task.projectId, patch.releaseId);
  if (
    patch.sprintId !== undefined &&
    task.sprintId &&
    (await isSprintClosed(task.sprintId))
  ) {
    throw new AppError("已关闭迭代中的任务不能重新规划");
  }
  validateEstimate(patch.estimate);
  validateEstimatedHours(patch.estimatedHours);
  const nextWorkItemType = patch.workItemType ?? task.workItemType;
  const nextBugSeverity =
    nextWorkItemType === "bug"
      ? patch.bugSeverity !== undefined
        ? patch.bugSeverity
        : task.bugSeverity
      : null;
  if (patch.bugSeverity && nextWorkItemType !== "bug") {
    throw new AppError("只有 Bug 可以设置严重程度");
  }
  const nextParentWorkItemId =
    patch.parentWorkItemId !== undefined
      ? patch.parentWorkItemId
      : task.parentWorkItemId;
  if (nextParentWorkItemId === taskId) {
    throw new AppError("工作项不能以自身为父项");
  }
  if (
    patch.workItemType !== undefined &&
    patch.workItemType !== task.workItemType
  ) {
    await validateWorkItemTypeChange(taskId, patch.workItemType);
  }
  if (
    patch.workItemType !== undefined ||
    patch.parentWorkItemId !== undefined
  ) {
    await validateWorkItemParent(
      task.projectId,
      nextWorkItemType,
      nextParentWorkItemId,
    );
  }
  const previousStatus = task.statusId
    ? await getWorkflowStatusById(query, task.projectId, task.statusId)
    : await getWorkflowStatusByCategory(query, task.projectId, task.status);
  let nextStatus = previousStatus;
  if (patch.statusId !== undefined) {
    nextStatus = await getWorkflowStatusById(
      query,
      task.projectId,
      patch.statusId,
    );
  } else if (patch.status !== undefined) {
    nextStatus = await getWorkflowStatusByCategory(
      query,
      task.projectId,
      patch.status,
    );
  }
  if (
    patch.statusId !== undefined ||
    patch.status !== undefined
  ) {
    await assertTransitionAllowed(
      query,
      task.projectId,
      task.statusId,
      nextStatus.id,
    );
    if (task.statusId !== nextStatus.id) {
      await enforceWipLimit(
        query,
        task.projectId,
        nextStatus.id,
        task.id,
      );
    }
  }

  const applyUpdate = async (exec: DbTx | typeof db) => {
    // 显式白名单构造，勿用 ...patch 展开：运行时宽对象可夹带 projectId/sortOrder 等越权字段
    const [updated] = await exec
      .update(tasks)
      // updatedAt 取 DB 时钟（now()）而非宿主机 new Date()：与 createdAt 的 defaultNow() 同源，保证单调性
      .set({
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.workItemType !== undefined && {
          workItemType: patch.workItemType,
        }),
        ...((patch.bugSeverity !== undefined ||
          patch.workItemType !== undefined) && {
          bugSeverity: nextBugSeverity,
        }),
        ...(patch.parentWorkItemId !== undefined && {
          parentWorkItemId: patch.parentWorkItemId,
        }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(nextAssigneeIds !== undefined && {
          assigneeId: nextAssigneeIds[0] ?? null,
        }),
        ...(patch.startDate !== undefined && { startDate: patch.startDate }),
        ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
        ...(patch.milestoneId !== undefined && { milestoneId: patch.milestoneId }),
        ...(patch.sprintId !== undefined && { sprintId: patch.sprintId }),
        ...(patch.releaseId !== undefined && { releaseId: patch.releaseId }),
        ...((patch.status !== undefined || patch.statusId !== undefined) && {
          status: nextStatus.category,
          statusId: nextStatus.id,
        }),
        ...(patch.priority !== undefined && { priority: patch.priority }),
        ...(patch.estimate !== undefined && { estimate: patch.estimate }),
        ...(patch.estimatedHours !== undefined && {
          estimatedHours: patch.estimatedHours,
        }),
        ...(patch.completionNote !== undefined && {
          completionNote: patch.completionNote,
        }),
        updatedAt: sql`now()`,
      })
      .where(eq(tasks.id, taskId))
      .returning();
    if (!updated) throw new AppError("任务不存在");

    if (nextAssigneeIds !== undefined) {
      await exec.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
      if (nextAssigneeIds.length > 0) {
        await exec.insert(taskAssignees).values(
          nextAssigneeIds.map((userId, position) => ({
            taskId,
            userId,
            position,
          })),
        );
      }
    }
    return updated;
  };

  const updated = opts?.tx
    ? await applyUpdate(opts.tx)
    : await db.transaction(applyUpdate);

  if (!opts?.tx) {
    // 改派：通知新负责人。兼容旧单值调用与新的多负责人调用。
    if (nextAssigneeIds) {
      for (const assigneeId of nextAssigneeIds) {
        if (!previousAssigneeIds.includes(assigneeId)) {
          void notifyTaskAssigned({ ...updated, assigneeId });
        }
      }
    }
    // 完成：通知创建者(≠操作者)
    if (
      nextStatus.category === "done" &&
      previousStatus.category !== "done"
    ) {
      void notifyTaskCompleted(updated, actorId);
    }
    if (
      (patch.statusId !== undefined || patch.status !== undefined) &&
      previousStatus.id !== nextStatus.id
    ) {
      await notifyWatchersOfStatusChange(
        actorId,
        updated,
        previousStatus.name,
        nextStatus.name,
      );
    }
  }
  if (
    (patch.statusId !== undefined || patch.status !== undefined) &&
    previousStatus.id !== nextStatus.id
  ) {
    await triggerTaskStatusAutomation({
      actorId,
      projectId: updated.projectId,
      taskId: updated.id,
      taskTitle: updated.title,
      workItemType: updated.workItemType,
      priority: updated.priority,
      fromStatus: previousStatus.category,
      toStatus: nextStatus.category,
    });
  }
  return updated;
}

export async function addTaskAttachment(
  actorId: string,
  taskId: string,
  input: { projectFileId: string },
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError("任务不存在");
  if (task.status !== "todo") throw new AppError("只有待办任务可以添加文件链接");

  const access = await getProjectForUser(actorId, task.projectId);
  if (!access) throw new ForbiddenError();
  const assigneeIds = await getTaskAssigneeIds(taskId, task.assigneeId);
  if (access.role !== "admin" && !assigneeIds.includes(actorId)) {
    throw new ForbiddenError("只有任务负责人或项目管理员可以添加文件链接");
  }

  const [file] = await db
    .select({
      id: projectFiles.id,
      name: projectFiles.name,
      projectId: projectFiles.projectId,
      status: projectFiles.status,
    })
    .from(projectFiles)
    .where(eq(projectFiles.id, input.projectFileId));
  if (!file || file.projectId !== task.projectId || file.status !== "ready") {
    throw new AppError("项目文件不存在或尚未上传完成");
  }

  const [existing] = await db
    .select()
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.taskId, taskId),
        eq(taskAttachments.projectFileId, file.id),
      ),
    );
  if (existing) return existing;

  const [attachment] = await db
    .insert(taskAttachments)
    .values({
      taskId,
      projectFileId: file.id,
      createdById: actorId,
      name: file.name,
      url: `/projects/${task.projectId}/files/${file.id}/view`,
    })
    .returning();
  return attachment;
}

export async function deleteTask(actorId: string, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError("任务不存在");
  await requireTaskWrite(actorId, task.projectId);
  await db.delete(tasks).where(eq(tasks.id, taskId));
}

export type TaskLabel = { id: string; name: string; color: string };

// 另发一次查询按 taskId 归并，不用 leftJoin：join 会造成行乘积，
// 污染既有 orderBy(sortOrder) 与调用方「一行一任务」的假设。
async function labelsByTask(taskIds: string[]): Promise<Map<string, TaskLabel[]>> {
  const map = new Map<string, TaskLabel[]>();
  if (taskIds.length === 0) return map;

  const rows = await db
    .select({
      taskId: taskLabels.taskId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(taskLabels)
    .innerJoin(labels, eq(taskLabels.labelId, labels.id))
    .where(inArray(taskLabels.taskId, taskIds))
    .orderBy(labels.name);

  for (const r of rows) {
    const list = map.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.taskId, list);
  }
  return map;
}

async function assigneesByTask(
  taskIds: string[],
): Promise<Map<string, TaskAssignee[]>> {
  const map = new Map<string, TaskAssignee[]>();
  if (taskIds.length === 0) return map;

  const rows = await db
    .select({
      taskId: taskAssignees.taskId,
      id: users.id,
      name: users.name,
    })
    .from(taskAssignees)
    .innerJoin(users, eq(taskAssignees.userId, users.id))
    .where(inArray(taskAssignees.taskId, taskIds))
    .orderBy(taskAssignees.position, users.name);

  for (const row of rows) {
    const list = map.get(row.taskId) ?? [];
    list.push({ id: row.id, name: row.name });
    map.set(row.taskId, list);
  }
  return map;
}

async function attachmentsByTask(
  taskIds: string[],
): Promise<Map<string, TaskAttachment[]>> {
  const map = new Map<string, TaskAttachment[]>();
  if (taskIds.length === 0) return map;

  const rows = await db
    .select({
      id: taskAttachments.id,
      taskId: taskAttachments.taskId,
      projectFileId: taskAttachments.projectFileId,
      name: taskAttachments.name,
      url: taskAttachments.url,
      createdById: taskAttachments.createdById,
      createdByName: users.name,
      createdAt: taskAttachments.createdAt,
    })
    .from(taskAttachments)
    .leftJoin(users, eq(taskAttachments.createdById, users.id))
    .where(inArray(taskAttachments.taskId, taskIds))
    .orderBy(taskAttachments.createdAt, taskAttachments.id);

  for (const row of rows) {
    const { taskId, ...attachment } = row;
    const list = map.get(taskId) ?? [];
    list.push(attachment);
    map.set(taskId, list);
  }
  return map;
}

async function actualHoursByTask(taskIds: string[]) {
  const map = new Map<string, number>();
  if (taskIds.length === 0) return map;

  const rows = await db
    .select({
      taskId: taskWorkLogs.taskId,
      hours: sql<number>`coalesce(sum(${taskWorkLogs.hours}), 0)::float8`,
    })
    .from(taskWorkLogs)
    .where(inArray(taskWorkLogs.taskId, taskIds))
    .groupBy(taskWorkLogs.taskId);

  for (const row of rows) map.set(row.taskId, row.hours);
  return map;
}

export async function getTaskAssigneeIds(
  taskId: string,
  legacyAssigneeId: string | null = null,
) {
  const rows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId))
    .orderBy(taskAssignees.position);
  if (rows.length > 0) return rows.map((item) => item.userId);
  return legacyAssigneeId ? [legacyAssigneeId] : [];
}

function withAssignees<
  T extends {
    id: string;
    assigneeId: string | null;
    assigneeName: string | null;
  },
>(rows: T[], byTask: Map<string, TaskAssignee[]>) {
  return rows.map((row) => {
    const assignees =
      byTask.get(row.id) ??
      (row.assigneeId
        ? [{ id: row.assigneeId, name: row.assigneeName ?? "未知用户" }]
        : []);
    return {
      ...row,
      assignees,
      assigneeIds: assignees.map((assignee) => assignee.id),
      assigneeId: assignees[0]?.id ?? null,
      assigneeName: assignees.map((assignee) => assignee.name).join("、") || null,
    };
  });
}

export async function listProjectTasks(actorId: string, projectId: string) {
  await requireProjectAccess(actorId, projectId);
  await ensureProjectWorkflow(projectId);
  await ensureProjectTaskNumbers(projectId);
  const rows = await db
    .select({
      id: tasks.id,
      taskNumber: tasks.taskNumber,
      title: tasks.title,
      workItemType: tasks.workItemType,
      bugSeverity: tasks.bugSeverity,
      parentWorkItemId: tasks.parentWorkItemId,
      description: tasks.description,
      status: tasks.status,
      statusId: tasks.statusId,
      statusName: workflowStatuses.name,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      estimate: tasks.estimate,
      estimatedHours: tasks.estimatedHours,
      backlogRank: tasks.backlogRank,
      sortOrder: tasks.sortOrder,
      milestoneId: tasks.milestoneId,
      sprintId: tasks.sprintId,
      releaseId: tasks.releaseId,
      parentTaskId: tasks.parentTaskId,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completionNote: tasks.completionNote,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(workflowStatuses, eq(tasks.statusId, workflowStatuses.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.sortOrder);

  const taskIds = rows.map((r) => r.id);
  const [labels, assignees, attachments, collaboration, actualHours] = await Promise.all([
    labelsByTask(taskIds),
    assigneesByTask(taskIds),
    attachmentsByTask(taskIds),
    taskCommentSummary(actorId, projectId, taskIds),
    actualHoursByTask(taskIds),
  ]);
  return withAssignees(rows, assignees).map((row) => ({
    ...row,
    labels: labels.get(row.id) ?? [],
    attachments: attachments.get(row.id) ?? [],
    actualHours: actualHours.get(row.id) ?? 0,
    commentCount: collaboration.counts.get(row.id) ?? 0,
    mentioned: collaboration.mentions.has(row.id),
  }));
}

// 列某任务之下的子任务（直接子级，不递归）
export async function listSubtasks(actorId: string, parentTaskId: string) {
  const [parent] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, parentTaskId));
  if (!parent) throw new AppError("任务不存在");
  await requireProjectAccess(actorId, parent.projectId);
  await ensureProjectWorkflow(parent.projectId);
  await ensureProjectTaskNumbers(parent.projectId);

  const rows = await db
    .select({
      id: tasks.id,
      taskNumber: tasks.taskNumber,
      title: tasks.title,
      workItemType: tasks.workItemType,
      bugSeverity: tasks.bugSeverity,
      parentWorkItemId: tasks.parentWorkItemId,
      description: tasks.description,
      status: tasks.status,
      statusId: tasks.statusId,
      statusName: workflowStatuses.name,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      estimate: tasks.estimate,
      estimatedHours: tasks.estimatedHours,
      milestoneId: tasks.milestoneId,
      sprintId: tasks.sprintId,
      releaseId: tasks.releaseId,
      parentTaskId: tasks.parentTaskId,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      completionNote: tasks.completionNote,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(workflowStatuses, eq(tasks.statusId, workflowStatuses.id))
    .where(eq(tasks.parentTaskId, parentTaskId))
    .orderBy(tasks.sortOrder);
  const taskIds = rows.map((row) => row.id);
  const [assignees, attachments, actualHours] = await Promise.all([
    assigneesByTask(taskIds),
    attachmentsByTask(taskIds),
    actualHoursByTask(taskIds),
  ]);
  return withAssignees(rows, assignees).map((row) => ({
    ...row,
    attachments: attachments.get(row.id) ?? [],
    actualHours: actualHours.get(row.id) ?? 0,
  }));
}

// 在某任务下建子任务：projectId 由父任务推得，调用方无须再传。
// 新建行必无既有子级，故不可能成环，无须环检测。
export async function createSubtask(
  actorId: string,
  parentTaskId: string,
  input: {
    title: string;
    workItemType?: WorkItemType;
    bugSeverity?: BugSeverity;
    description?: string;
    assigneeId?: string;
    assigneeIds?: string[];
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
    sprintId?: string;
    releaseId?: string;
    priority?: TaskPriority;
    estimate?: number;
    estimatedHours?: number;
  },
) {
  const [parent] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, parentTaskId));
  if (!parent) throw new AppError("任务不存在");
  return createTask(actorId, parent.projectId, { ...input, parentTaskId });
}

// 单任务详情（供 Agent API 按 id 直取）。权限口径同 listProjectTasks：项目成员即可读。
// 注：「任务不存在」先于权限返回，沿既有 updateTask/deleteTask 之口径（BACKLOG 已录此债）。
export async function getTaskDetail(actorId: string, taskId: string) {
  const [row] = await db
    .select({
      id: tasks.id,
      taskNumber: tasks.taskNumber,
      projectId: tasks.projectId,
      title: tasks.title,
      workItemType: tasks.workItemType,
      bugSeverity: tasks.bugSeverity,
      parentWorkItemId: tasks.parentWorkItemId,
      description: tasks.description,
      completionNote: tasks.completionNote,
      status: tasks.status,
      statusId: tasks.statusId,
      statusName: workflowStatuses.name,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      estimate: tasks.estimate,
      estimatedHours: tasks.estimatedHours,
      milestoneId: tasks.milestoneId,
      sprintId: tasks.sprintId,
      releaseId: tasks.releaseId,
      parentTaskId: tasks.parentTaskId,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      updatedAt: tasks.updatedAt,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(workflowStatuses, eq(tasks.statusId, workflowStatuses.id))
    .where(eq(tasks.id, taskId));
  if (!row) throw new AppError("任务不存在");
  await requireProjectAccess(actorId, row.projectId);
  if (!row.statusId) {
    await ensureProjectWorkflow(row.projectId);
    const status = await getWorkflowStatusByCategory(
      db,
      row.projectId,
      row.status,
    );
    row.statusId = status.id;
    row.statusName = status.name;
  }
  const [labels, assignees, attachments, actualHours] = await Promise.all([
    labelsByTask([row.id]),
    assigneesByTask([row.id]),
    attachmentsByTask([row.id]),
    actualHoursByTask([row.id]),
  ]);
  const decorated = withAssignees([row], assignees)[0];
  return {
    ...decorated,
    labels: labels.get(row.id) ?? [],
    attachments: attachments.get(row.id) ?? [],
    actualHours: actualHours.get(row.id) ?? 0,
  };
}

// 设置 predecessor 的后置任务（先删旧再插新）。简单关联：仅防直接成环，不强制阻断执行。
export async function setTaskSuccessors(
  actorId: string,
  predecessorId: string,
  successorIds: string[],
) {
  const [pred] = await db.select().from(tasks).where(eq(tasks.id, predecessorId));
  if (!pred) throw new AppError("任务不存在");
  await requireTaskWrite(actorId, pred.projectId);

  for (const sid of successorIds) {
    if (sid === predecessorId) throw new AppError("后置任务不可构成循环");
    const [s] = await db
      .select({ projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, sid));
    if (!s || s.projectId !== pred.projectId)
      throw new AppError("后置任务不属于该项目");
    const [back] = await db
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.predecessorId, sid),
          eq(taskDependencies.successorId, predecessorId),
        ),
      );
    if (back) throw new AppError("后置任务不可构成循环");
  }

  await db.transaction(async (tx) => {
    await tx.delete(taskDependencies).where(eq(taskDependencies.predecessorId, predecessorId));
    if (successorIds.length > 0) {
      await tx
        .insert(taskDependencies)
        .values(successorIds.map((sid) => ({ predecessorId, successorId: sid })));
    }
  });
}

export async function listProjectDependencies(actorId: string, projectId: string) {
  await requireProjectAccess(actorId, projectId);
  return db
    .select({
      predecessorId: taskDependencies.predecessorId,
      successorId: taskDependencies.successorId,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.predecessorId, tasks.id))
    .where(eq(tasks.projectId, projectId));
}
