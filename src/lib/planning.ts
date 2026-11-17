import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  releases,
  projects,
  sprints,
  sprintMemberCapacities,
  taskWorkLogs,
  tasks,
  users,
  type ReleaseStatus,
  type TeamRole,
} from "@/db/schema";
import { AppError, ForbiddenError, isUniqueViolation } from "./errors";
import {
  getProjectForUser,
  listProjectMilestones,
} from "./project";
import {
  listProjectSprints,
  type SprintSummary,
} from "./sprint";
import { getTeamMembership, listTeamMembers } from "./team";
import { getTaskDetail, listProjectTasks } from "./task";
import { triggerReleaseStatusAutomation } from "./automation-trigger";

const PLANNING_WRITE_ROLES: TeamRole[] = ["admin", "student"];

export type ReleaseRow = typeof releases.$inferSelect;

export type ReleaseSummary = {
  id: string;
  name: string;
  description: string | null;
  status: ReleaseStatus;
  startDate: string | null;
  targetDate: string | null;
  releaseDate: string | null;
  taskCount: number;
  doneTaskCount: number;
  estimateTotal: number;
  estimatedHours: number;
  actualHours: number;
};

export type SprintCapacityMember = {
  userId: string;
  name: string;
  role: TeamRole;
  availableHours: number;
};

export type SprintCapacitySummary = {
  sprintId: string;
  sprintName: string;
  status: SprintSummary["status"];
  startDate: string;
  endDate: string;
  storyPointCapacity: number;
  taskCount: number;
  estimateTotal: number;
  completedEstimate: number;
  estimatedHours: number;
  actualHours: number;
  availableHours: number;
  utilization:
    | {
        plannedPercent: number;
        actualPercent: number;
      }
    | null;
  members: SprintCapacityMember[];
};

export type ProjectWorkLog = {
  id: string;
  taskId: string;
  taskTitle: string;
  userId: string | null;
  userName: string | null;
  hours: number;
  workDate: string;
  note: string | null;
  createdAt: Date;
};

export type ProjectPlanningSummary = {
  taskCount: number;
  doneTaskCount: number;
  totalPoints: number;
  completedPoints: number;
  estimatedHours: number;
  actualHours: number;
  openMilestoneCount: number;
  nextMilestone: {
    id: string;
    title: string;
    targetDate: string | null;
  } | null;
  releaseCount: number;
  availableHours: number;
};

export type ProjectPlanning = {
  project: typeof projects.$inferSelect;
  role: TeamRole;
  milestones: Awaited<ReturnType<typeof listProjectMilestones>>;
  sprints: SprintSummary[];
  tasks: Awaited<ReturnType<typeof listProjectTasks>>;
  releases: ReleaseSummary[];
  sprintCapacities: SprintCapacitySummary[];
  workLogs: ProjectWorkLog[];
  summary: ProjectPlanningSummary;
};

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validateReleaseDates(input: {
  startDate?: string | null;
  targetDate?: string | null;
  releaseDate?: string | null;
}) {
  if (
    input.startDate &&
    input.targetDate &&
    input.targetDate < input.startDate
  ) {
    throw new AppError("版本目标日期不能早于开始日期");
  }
  if (
    input.targetDate &&
    input.releaseDate &&
    input.releaseDate < input.targetDate
  ) {
    throw new AppError("实际发布日期不能早于目标日期");
  }
}

function validateHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new AppError("单条工时必须大于 0 且不超过 24 小时");
  }
}

async function requirePlanningWrite(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  if (!PLANNING_WRITE_ROLES.includes(access.role)) throw new ForbiddenError();
  return access;
}

export async function listProjectReleases(
  actorId: string,
  projectId: string,
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return db
    .select()
    .from(releases)
    .where(eq(releases.projectId, projectId))
    .orderBy(asc(releases.targetDate), asc(releases.name));
}

export async function createRelease(
  actorId: string,
  projectId: string,
  input: {
    name: string;
    description?: string;
    status?: ReleaseStatus;
    startDate?: string;
    targetDate?: string;
    releaseDate?: string;
  },
) {
  await requirePlanningWrite(actorId, projectId);
  validateReleaseDates(input);
  try {
    const [release] = await db
      .insert(releases)
      .values({
        projectId,
        createdById: actorId,
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim() || null,
        status: input.status ?? "planned",
        startDate: input.startDate,
        targetDate: input.targetDate,
        releaseDate: input.releaseDate,
      })
      .returning();
    return release;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("该版本名称已存在");
    throw error;
  }
}

export async function updateRelease(
  actorId: string,
  releaseId: string,
  patch: {
    name?: string;
    description?: string | null;
    status?: ReleaseStatus;
    startDate?: string | null;
    targetDate?: string | null;
    releaseDate?: string | null;
  },
) {
  const [release] = await db
    .select()
    .from(releases)
    .where(eq(releases.id, releaseId));
  if (!release) throw new AppError("版本不存在");
  await requirePlanningWrite(actorId, release.projectId);

  const next = {
    startDate:
      patch.startDate !== undefined ? patch.startDate : release.startDate,
    targetDate:
      patch.targetDate !== undefined ? patch.targetDate : release.targetDate,
    releaseDate:
      patch.releaseDate !== undefined ? patch.releaseDate : release.releaseDate,
  };
  validateReleaseDates(next);
  const status = patch.status ?? release.status;
  const releaseDate =
    status === "released" && !next.releaseDate
      ? todayKey()
      : next.releaseDate;

  try {
    const [updated] = await db
      .update(releases)
      .set({
        ...(patch.name !== undefined && {
          name: patch.name.trim().slice(0, 120),
        }),
        ...(patch.description !== undefined && {
          description: patch.description?.trim() || null,
        }),
        status,
        startDate: next.startDate,
        targetDate: next.targetDate,
        releaseDate,
        updatedAt: sql`now()`,
      })
      .where(eq(releases.id, releaseId))
      .returning();
    if (updated.status !== release.status) {
      await triggerReleaseStatusAutomation({
        actorId,
        projectId: release.projectId,
        releaseId: release.id,
        releaseName: updated.name,
        releaseStatus: updated.status,
        previousStatus: release.status,
      });
    }
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("该版本名称已存在");
    throw error;
  }
}

export async function deleteRelease(actorId: string, releaseId: string) {
  const [release] = await db
    .select()
    .from(releases)
    .where(eq(releases.id, releaseId));
  if (!release) throw new AppError("版本不存在");
  await requirePlanningWrite(actorId, release.projectId);
  await db.delete(releases).where(eq(releases.id, releaseId));
}

export async function saveSprintCapacities(
  actorId: string,
  projectId: string,
  sprintId: string,
  hoursByUser: Record<string, number>,
) {
  const access = await requirePlanningWrite(actorId, projectId);
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)));
  if (!sprint) throw new AppError("迭代不存在");
  if (sprint.status === "closed") throw new AppError("已关闭迭代不能修改容量");

  const entries = Object.entries(hoursByUser);
  for (const [userId, hours] of entries) {
    if (!Number.isFinite(hours) || hours < 0 || hours > 1000) {
      throw new AppError("成员可用工时必须是非负数");
    }
    const membership = await getTeamMembership(
      userId,
      access.project.teamId,
    );
    if (!membership) throw new AppError("容量成员不属于该团队");
  }

  if (entries.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [userId, hours] of entries) {
      await tx
        .insert(sprintMemberCapacities)
        .values({ sprintId, userId, availableHours: hours })
        .onConflictDoUpdate({
          target: [
            sprintMemberCapacities.sprintId,
            sprintMemberCapacities.userId,
          ],
          set: {
            availableHours: hours,
            updatedAt: sql`now()`,
          },
        });
    }
  });
}

export async function listProjectSprintCapacities(
  actorId: string,
  projectId: string,
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  const [sprints, members, taskRows] = await Promise.all([
    listProjectSprints(actorId, projectId),
    listTeamMembers(access.project.teamId),
    listProjectTasks(actorId, projectId),
  ]);
  const sprintIds = sprints.map((sprint) => sprint.id);
  const capacityRows =
    sprintIds.length === 0
      ? []
      : await db
          .select()
          .from(sprintMemberCapacities)
          .where(inArray(sprintMemberCapacities.sprintId, sprintIds));
  return buildSprintCapacities(sprints, members, taskRows, capacityRows);
}

type CapacityRow = typeof sprintMemberCapacities.$inferSelect;
type SprintTask = Awaited<ReturnType<typeof listProjectTasks>>[number];
type TeamMember = Awaited<ReturnType<typeof listTeamMembers>>[number];

export function buildSprintCapacities(
  sprints: SprintSummary[],
  members: TeamMember[],
  taskRows: SprintTask[],
  capacityRows: CapacityRow[],
): SprintCapacitySummary[] {
  return sprints.map((sprint) => {
    const scoped = taskRows.filter((task) => task.sprintId === sprint.id);
    const hours = new Map(
      capacityRows
        .filter((row) => row.sprintId === sprint.id)
        .map((row) => [row.userId, row.availableHours]),
    );
    const memberCapacities = members.map((member) => ({
      userId: member.id,
      name: member.name,
      role: member.role,
      availableHours: hours.get(member.id) ?? 0,
    }));
    const availableHours = memberCapacities.reduce(
      (sum, member) => sum + member.availableHours,
      0,
    );
    const estimatedHours = scoped.reduce(
      (sum, task) => sum + (task.estimatedHours ?? 0),
      0,
    );
    const actualHours = scoped.reduce(
      (sum, task) => sum + task.actualHours,
      0,
    );
    return {
      sprintId: sprint.id,
      sprintName: sprint.name,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      storyPointCapacity: sprint.capacity,
      taskCount: scoped.length,
      estimateTotal: scoped.reduce(
        (sum, task) => sum + (task.estimate ?? 0),
        0,
      ),
      completedEstimate: scoped
        .filter((task) => task.status === "done")
        .reduce((sum, task) => sum + (task.estimate ?? 0), 0),
      estimatedHours,
      actualHours,
      availableHours,
      utilization:
        availableHours > 0
          ? {
              plannedPercent: Math.round((estimatedHours / availableHours) * 100),
              actualPercent: Math.round((actualHours / availableHours) * 100),
            }
          : null,
      members: memberCapacities,
    };
  });
}

export function buildReleaseSummaries(
  releaseRows: ReleaseRow[],
  taskRows: SprintTask[],
): ReleaseSummary[] {
  return releaseRows.map((release) => {
    const scoped = taskRows.filter((task) => task.releaseId === release.id);
    return {
      id: release.id,
      name: release.name,
      description: release.description,
      status: release.status,
      startDate: release.startDate,
      targetDate: release.targetDate,
      releaseDate: release.releaseDate,
      taskCount: scoped.length,
      doneTaskCount: scoped.filter((task) => task.status === "done").length,
      estimateTotal: scoped.reduce(
        (sum, task) => sum + (task.estimate ?? 0),
        0,
      ),
      estimatedHours: scoped.reduce(
        (sum, task) => sum + (task.estimatedHours ?? 0),
        0,
      ),
      actualHours: scoped.reduce((sum, task) => sum + task.actualHours, 0),
    };
  });
}

export async function listProjectWorkLogs(
  actorId: string,
  projectId: string,
  limit = 40,
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return db
    .select({
      id: taskWorkLogs.id,
      taskId: taskWorkLogs.taskId,
      taskTitle: tasks.title,
      userId: taskWorkLogs.userId,
      userName: users.name,
      hours: taskWorkLogs.hours,
      workDate: taskWorkLogs.workDate,
      note: taskWorkLogs.note,
      createdAt: taskWorkLogs.createdAt,
    })
    .from(taskWorkLogs)
    .innerJoin(tasks, eq(taskWorkLogs.taskId, tasks.id))
    .leftJoin(users, eq(taskWorkLogs.userId, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(taskWorkLogs.workDate), desc(taskWorkLogs.createdAt))
    .limit(limit);
}

export async function getTaskWorkLogs(actorId: string, taskId: string) {
  const task = await getTaskDetail(actorId, taskId);
  const logs = await db
    .select({
      id: taskWorkLogs.id,
      userId: taskWorkLogs.userId,
      userName: users.name,
      hours: taskWorkLogs.hours,
      workDate: taskWorkLogs.workDate,
      note: taskWorkLogs.note,
      createdAt: taskWorkLogs.createdAt,
    })
    .from(taskWorkLogs)
    .leftJoin(users, eq(taskWorkLogs.userId, users.id))
    .where(eq(taskWorkLogs.taskId, taskId))
    .orderBy(desc(taskWorkLogs.workDate), desc(taskWorkLogs.createdAt));
  return {
    taskId,
    estimatedHours: task.estimatedHours,
    actualHours: logs.reduce((sum, log) => sum + log.hours, 0),
    logs,
  };
}

export async function createTaskWorkLog(
  actorId: string,
  input: {
    taskId: string;
    hours: number;
    workDate: string;
    note?: string;
  },
) {
  const task = await getTaskDetail(actorId, input.taskId);
  const access = await getProjectForUser(actorId, task.projectId);
  if (!access) throw new ForbiddenError();
  if (!PLANNING_WRITE_ROLES.includes(access.role)) throw new ForbiddenError();
  validateHours(input.hours);
  if (input.workDate > todayKey()) throw new AppError("工时日期不能晚于今天");

  const [log] = await db
    .insert(taskWorkLogs)
    .values({
      taskId: input.taskId,
      userId: actorId,
      hours: Math.round(input.hours * 100) / 100,
      workDate: input.workDate,
      note: input.note?.trim().slice(0, 500) || null,
    })
    .returning();
  return log;
}

export async function deleteTaskWorkLog(actorId: string, workLogId: string) {
  const [row] = await db
    .select({
      id: taskWorkLogs.id,
      taskId: taskWorkLogs.taskId,
      userId: taskWorkLogs.userId,
      projectId: tasks.projectId,
    })
    .from(taskWorkLogs)
    .innerJoin(tasks, eq(taskWorkLogs.taskId, tasks.id))
    .where(eq(taskWorkLogs.id, workLogId));
  if (!row) throw new AppError("工时记录不存在");
  const access = await getProjectForUser(actorId, row.projectId);
  if (!access) throw new ForbiddenError();
  if (!PLANNING_WRITE_ROLES.includes(access.role)) throw new ForbiddenError();
  if (access.role !== "admin" && row.userId !== actorId) {
    throw new ForbiddenError("只能删除自己的工时记录");
  }
  await db.delete(taskWorkLogs).where(eq(taskWorkLogs.id, workLogId));
}

export async function getProjectPlanning(
  actorId: string,
  projectId: string,
): Promise<ProjectPlanning | null> {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) return null;
  const [milestones, sprints, taskRows, releaseRows, workLogs] =
    await Promise.all([
      listProjectMilestones(actorId, projectId),
      listProjectSprints(actorId, projectId),
      listProjectTasks(actorId, projectId),
      listProjectReleases(actorId, projectId),
      listProjectWorkLogs(actorId, projectId),
    ]);
  const [members, capacityRows] = await Promise.all([
    listTeamMembers(access.project.teamId),
    sprints.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(sprintMemberCapacities)
          .where(
            inArray(
              sprintMemberCapacities.sprintId,
              sprints.map((sprint) => sprint.id),
            ),
          ),
  ]);

  const releaseSummaries = buildReleaseSummaries(releaseRows, taskRows);
  const sprintCapacities = buildSprintCapacities(
    sprints,
    members,
    taskRows,
    capacityRows,
  );
  const activeCapacity =
    sprintCapacities.find((capacity) => capacity.status === "active") ?? null;
  const openMilestones = milestones.filter(
    (milestone) => milestone.status === "open",
  );
  const nextMilestone =
    openMilestones
      .filter((milestone) => milestone.targetDate !== null)
      .sort((a, b) => (a.targetDate ?? "").localeCompare(b.targetDate ?? ""))
      .find((milestone) => (milestone.targetDate ?? "") >= todayKey()) ??
    openMilestones[0] ??
    null;
  const completedTasks = taskRows.filter((task) => task.status === "done");

  return {
    project: access.project,
    role: access.role,
    milestones,
    sprints,
    tasks: taskRows,
    releases: releaseSummaries,
    sprintCapacities,
    workLogs,
    summary: {
      taskCount: taskRows.length,
      doneTaskCount: completedTasks.length,
      totalPoints: taskRows.reduce(
        (sum, task) => sum + (task.estimate ?? 0),
        0,
      ),
      completedPoints: completedTasks.reduce(
        (sum, task) => sum + (task.estimate ?? 0),
        0,
      ),
      estimatedHours: taskRows.reduce(
        (sum, task) => sum + (task.estimatedHours ?? 0),
        0,
      ),
      actualHours: taskRows.reduce(
        (sum, task) => sum + task.actualHours,
        0,
      ),
      openMilestoneCount: openMilestones.length,
      nextMilestone: nextMilestone
        ? {
            id: nextMilestone.id,
            title: nextMilestone.title,
            targetDate: nextMilestone.targetDate,
          }
        : null,
      releaseCount: releaseSummaries.length,
      availableHours: activeCapacity?.availableHours ?? 0,
    },
  };
}
