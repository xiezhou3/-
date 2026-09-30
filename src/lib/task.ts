import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTx } from "@/db";
import {
  labels,
  milestones,
  taskAssignees,
  taskDependencies,
  taskLabels,
  tasks,
  users,
  type TaskPriority,
  type TaskStatus,
} from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getTeamMembership } from "./team";
import { getProjectForUser } from "./project";
import { notifyTaskAssigned, notifyTaskCompleted } from "./notify";

// 任务写操作角色：admin + student（teacher 只读，设计文档 §5）
const TASK_WRITE_ROLES = ["admin", "student"];

export type TaskAssignee = { id: string; name: string };

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

// 父任务须存在且同项目——防跨项目挂载
async function validateParentTask(projectId: string, parentTaskId: string) {
  const [p] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, parentTaskId), eq(tasks.projectId, projectId)));
  if (!p) throw new AppError("父任务不属于该项目");
}

export async function createTask(
  actorId: string,
  projectId: string,
  input: {
    title: string;
    description?: string;
    assigneeId?: string;
    assigneeIds?: string[];
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
    priority?: TaskPriority;
    status?: TaskStatus;
    parentTaskId?: string;
  },
  opts?: { tx?: DbTx },
) {
  const access = await requireTaskWrite(actorId, projectId);
  const assigneeIds = uniqueIds(
    input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : []),
  );
  await validateAssignees(access.project.teamId, assigneeIds);
  if (input.milestoneId) await validateMilestone(projectId, input.milestoneId);
  if (input.parentTaskId) await validateParentTask(projectId, input.parentTaskId);

  const insertTask = async (exec: DbTx | typeof db) => {
    const [task] = await exec
      .insert(tasks)
      .values({
        projectId,
        createdById: actorId,
        title: input.title,
        description: input.description,
        assigneeId: assigneeIds[0] ?? null,
        startDate: input.startDate,
        dueDate: input.dueDate,
        milestoneId: input.milestoneId,
        parentTaskId: input.parentTaskId,
        priority: input.priority ?? "medium",
        status: input.status ?? "todo",
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
    description?: string | null;
    assigneeId?: string | null;
    assigneeIds?: string[];
    startDate?: string | null;
    dueDate?: string | null;
    milestoneId?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    completionNote?: string | null;
  },
  opts?: { tx?: DbTx },
) {
  const query = opts?.tx ?? db;
  const [task] = await query.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError("任务不存在");

  const access = await requireProjectAccess(actorId, task.projectId);
  if (access.role !== "admin") {
    throw new ForbiddenError("只有项目管理员可以编辑任务");
  }
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

  const applyUpdate = async (exec: DbTx | typeof db) => {
    // 显式白名单构造，勿用 ...patch 展开：运行时宽对象可夹带 projectId/sortOrder 等越权字段
    const [updated] = await exec
      .update(tasks)
      // updatedAt 取 DB 时钟（now()）而非宿主机 new Date()：与 createdAt 的 defaultNow() 同源，保证单调性
      .set({
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(nextAssigneeIds !== undefined && {
          assigneeId: nextAssigneeIds[0] ?? null,
        }),
        ...(patch.startDate !== undefined && { startDate: patch.startDate }),
        ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
        ...(patch.milestoneId !== undefined && { milestoneId: patch.milestoneId }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.priority !== undefined && { priority: patch.priority }),
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
    if (patch.status === "done" && task.status !== "done") void notifyTaskCompleted(updated, actorId);
  }
  return updated;
}

export async function moveTask(
  actorId: string,
  taskId: string,
  status: TaskStatus,
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError("任务不存在");

  const access = await getProjectForUser(actorId, task.projectId);
  if (!access) throw new ForbiddenError();

  const assigneeIds = await getTaskAssigneeIds(taskId, task.assigneeId);
  const isAdmin = access.role === "admin";
  const isAssignee = assigneeIds.includes(actorId);
  if (!isAdmin && !isAssignee) {
    throw new ForbiddenError("只有任务负责人或项目管理员可以拖动任务");
  }
  if (task.status === "doing" && !isAdmin) {
    throw new ForbiddenError("待审核任务只能由项目管理员移动");
  }

  const [updated] = await db
    .update(tasks)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(tasks.id, taskId))
    .returning();
  if (!updated) throw new AppError("任务不存在");

  if (status === "done" && task.status !== "done") {
    void notifyTaskCompleted(updated, actorId);
  }
  return updated;
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
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      sortOrder: tasks.sortOrder,
      milestoneId: tasks.milestoneId,
      parentTaskId: tasks.parentTaskId,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      updatedAt: tasks.updatedAt,
      completionNote: tasks.completionNote,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.sortOrder);

  const taskIds = rows.map((r) => r.id);
  const [labels, assignees] = await Promise.all([
    labelsByTask(taskIds),
    assigneesByTask(taskIds),
  ]);
  return withAssignees(rows, assignees).map((row) => ({
    ...row,
    labels: labels.get(row.id) ?? [],
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

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      milestoneId: tasks.milestoneId,
      parentTaskId: tasks.parentTaskId,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      completionNote: tasks.completionNote,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.parentTaskId, parentTaskId))
    .orderBy(tasks.sortOrder);
  return withAssignees(rows, await assigneesByTask(rows.map((row) => row.id)));
}

// 在某任务下建子任务：projectId 由父任务推得，调用方无须再传。
// 新建行必无既有子级，故不可能成环，无须环检测。
export async function createSubtask(
  actorId: string,
  parentTaskId: string,
  input: {
    title: string;
    description?: string;
    assigneeId?: string;
    assigneeIds?: string[];
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
    priority?: TaskPriority;
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
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      completionNote: tasks.completionNote,
      status: tasks.status,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      milestoneId: tasks.milestoneId,
      parentTaskId: tasks.parentTaskId,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      updatedAt: tasks.updatedAt,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.id, taskId));
  if (!row) throw new AppError("任务不存在");
  await requireProjectAccess(actorId, row.projectId);
  const [labels, assignees] = await Promise.all([
    labelsByTask([row.id]),
    assigneesByTask([row.id]),
  ]);
  const decorated = withAssignees([row], assignees)[0];
  return { ...decorated, labels: labels.get(row.id) ?? [] };
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
