import { getProjectForUser } from "./project";
import { listProjectSprints, type SprintSummary } from "./sprint";
import { listProjectTasks } from "./task";
import {
  buildReleaseSummaries,
  listProjectReleases,
  listProjectSprintCapacities,
} from "./planning";

type TaskRow = Awaited<ReturnType<typeof listProjectTasks>>[number];

const DAY = 86_400_000;

function atMidnight(value: string) {
  return new Date(`${value}T00:00:00`);
}

function dateKey(date: Date) {
  return date.toLocaleDateString("sv-SE");
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

function points(task: TaskRow) {
  return task.estimate ?? 0;
}

export function buildBurndown(
  sprint: Pick<SprintSummary, "startDate" | "endDate">,
  tasks: TaskRow[],
  today: string,
) {
  const start = atMidnight(sprint.startDate);
  const end = atMidnight(sprint.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / DAY) + 1,
  );
  const totalPoints = tasks.reduce((sum, task) => sum + points(task), 0);
  const completed = tasks
    .filter((task) => task.status === "done")
    .map((task) => ({
      date: dateKey(task.updatedAt),
      points: points(task),
    }));

  return Array.from({ length: totalDays }, (_, index) => {
    const current = addDays(start, index);
    const currentKey = dateKey(current);
    const ideal =
      totalDays === 1
        ? 0
        : Math.max(0, totalPoints * (1 - index / (totalDays - 1)));
    const completedPoints = completed
      .filter((task) => task.date <= currentKey)
      .reduce((sum, task) => sum + task.points, 0);
    return {
      date: currentKey.slice(5),
      ideal: Math.round(ideal * 10) / 10,
      actual:
        currentKey <= today
          ? Math.round(Math.max(0, totalPoints - completedPoints) * 10) / 10
          : null,
    };
  });
}

export function buildVelocity(
  sprints: SprintSummary[],
  tasks: TaskRow[],
) {
  const bySprint = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    if (!task.sprintId) continue;
    const list = bySprint.get(task.sprintId) ?? [];
    list.push(task);
    bySprint.set(task.sprintId, list);
  }
  return sprints
    .filter((sprint) => sprint.status === "closed")
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(-8)
    .map((sprint) => {
      const list = bySprint.get(sprint.id) ?? [];
      const completed = list.filter((task) => task.status === "done");
      return {
        name: sprint.name,
        completed: completed.reduce((sum, task) => sum + points(task), 0),
        capacity: sprint.capacity,
        completedTasks: completed.length,
        totalTasks: list.length,
      };
    });
}

export function buildSprintProgress(
  sprint: SprintSummary,
  tasks: TaskRow[],
  today: string,
) {
  const scoped = tasks.filter((task) => task.sprintId === sprint.id);
  const completed = scoped.filter((task) => task.status === "done");
  const totalPoints = scoped.reduce((sum, task) => sum + points(task), 0);
  const completedPoints = completed.reduce((sum, task) => sum + points(task), 0);
  const end = atMidnight(sprint.endDate);
  const now = atMidnight(today);
  return {
    taskTotal: scoped.length,
    taskDone: completed.length,
    totalPoints,
    completedPoints,
    remainingPoints: Math.max(0, totalPoints - completedPoints),
    unestimated: scoped.filter((task) => task.estimate === null).length,
    daysRemaining: Math.max(
      0,
      Math.ceil((end.getTime() - now.getTime()) / DAY),
    ),
  };
}

export function buildHoursSummary(tasks: TaskRow[]) {
  const estimatedHours = tasks.reduce(
    (sum, task) => sum + (task.estimatedHours ?? 0),
    0,
  );
  const actualHours = tasks.reduce(
    (sum, task) => sum + task.actualHours,
    0,
  );
  return {
    estimatedHours,
    actualHours,
    varianceHours: actualHours - estimatedHours,
    estimatedTaskCount: tasks.filter((task) => task.estimatedHours !== null)
      .length,
    loggedTaskCount: tasks.filter((task) => task.actualHours > 0).length,
  };
}

export async function getSprintReportData(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) return null;
  const [sprints, tasks, releaseRows, sprintCapacities] = await Promise.all([
    listProjectSprints(actorId, projectId),
    listProjectTasks(actorId, projectId),
    listProjectReleases(actorId, projectId),
    listProjectSprintCapacities(actorId, projectId),
  ]);
  const today = dateKey(new Date());
  const activeSprint =
    sprints.find((sprint) => sprint.status === "active") ?? null;
  return {
    project: access.project,
    role: access.role,
    activeSprint,
    progress: activeSprint
      ? buildSprintProgress(activeSprint, tasks, today)
      : null,
    burndown: activeSprint
      ? buildBurndown(activeSprint, tasks.filter((task) => task.sprintId === activeSprint.id), today)
      : [],
    velocity: buildVelocity(sprints, tasks),
    hours: buildHoursSummary(tasks),
    sprintCapacity:
      sprintCapacities.find(
        (capacity) => capacity.sprintId === activeSprint?.id,
      ) ?? null,
    releases: buildReleaseSummaries(releaseRows, tasks),
  };
}
