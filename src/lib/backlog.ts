import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { AppError } from "./errors";
import { getProjectForUser } from "./project";
import {
  assertSprintAssignable,
  listProjectSprints,
} from "./sprint";
import {
  createTask,
  listProjectTasks,
  requireTaskWrite,
} from "./task";

function sortByRank<T extends { backlogRank: number; createdAt: Date; id: string }>(
  list: T[],
) {
  return [...list].sort(
    (a, b) =>
      a.backlogRank - b.backlogRank ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export async function listBacklogData(
  actorId: string,
  projectId: string,
  requestedSprintId?: string,
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new AppError("项目不存在或无权限");

  const [sprintList, taskList] = await Promise.all([
    listProjectSprints(actorId, projectId),
    listProjectTasks(actorId, projectId),
  ]);
  const openSprints = sprintList.filter(
    (sprint) => sprint.status === "planned" || sprint.status === "active",
  );
  const selectedSprint =
    openSprints.find((sprint) => sprint.id === requestedSprintId) ??
    openSprints.find((sprint) => sprint.status === "active") ??
    openSprints
      .filter((sprint) => sprint.status === "planned")
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
    null;

  const backlogTasks = sortByRank(
    taskList.filter((task) => task.sprintId === null),
  );
  const sprintTasks = selectedSprint
    ? sortByRank(
        taskList.filter((task) => task.sprintId === selectedSprint.id),
      )
    : [];

  return {
    project: access.project,
    role: access.role,
    sprints: openSprints,
    selectedSprint,
    allTasks: taskList,
    backlogTasks,
    sprintTasks,
  };
}

export async function createBacklogTask(
  actorId: string,
  projectId: string,
  title: string,
) {
  const normalized = title.trim();
  if (!normalized) throw new AppError("请填写任务标题");
  if (normalized.length > 200) throw new AppError("任务标题最多 200 字");
  return createTask(actorId, projectId, {
    title: normalized,
    priority: "medium",
  });
}

const RANK_STEP = 1024;

export async function reorderBacklog(
  actorId: string,
  projectId: string,
  sprintId: string,
  backlogTaskIds: string[],
  sprintTaskIds: string[],
) {
  await requireTaskWrite(actorId, projectId);
  await assertSprintAssignable(projectId, sprintId);

  const backlogIds = [...new Set(backlogTaskIds)];
  const sprintIds = [...new Set(sprintTaskIds)];
  const overlap = backlogIds.filter((id) => sprintIds.includes(id));
  if (overlap.length > 0) {
    throw new AppError("任务不能同时出现在两个列表中");
  }
  const allIds = [...backlogIds, ...sprintIds];
  if (allIds.length === 0) return { backlogCount: 0, sprintCount: 0 };

  const rows = await db
    .select({ id: tasks.id, sprintId: tasks.sprintId })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        inArray(tasks.id, allIds),
      ),
    );
  if (rows.length !== allIds.length) {
    throw new AppError("Backlog 列表包含无效任务");
  }
  if (
    rows.some(
      (task) =>
        task.sprintId !== null && task.sprintId !== sprintId,
    )
  ) {
    throw new AppError("Backlog 列表包含其他迭代的任务");
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < backlogIds.length; index++) {
      await tx
        .update(tasks)
        .set({
          sprintId: null,
          backlogRank: (index + 1) * RANK_STEP,
          updatedAt: sql`now()`,
        })
        .where(eq(tasks.id, backlogIds[index]));
    }
    for (let index = 0; index < sprintIds.length; index++) {
      await tx
        .update(tasks)
        .set({
          sprintId,
          backlogRank: (index + 1) * RANK_STEP,
          updatedAt: sql`now()`,
        })
        .where(eq(tasks.id, sprintIds[index]));
    }
  });

  return {
    backlogCount: backlogIds.length,
    sprintCount: sprintIds.length,
  };
}
