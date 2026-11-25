import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  taskAssignees,
  taskReviewRequests,
  tasks,
  teamMembers,
  teams,
  workflowStatuses,
  type TaskPriority,
  type TeamRole,
  type WorkItemType,
} from "@/db/schema";
import {
  countUnreadNotifications,
  listMyNotifications,
} from "./notification";
import {
  listPendingTaskReviewsForAdmin,
  type PendingTaskReview,
} from "./task-review";
import {
  listRecentVisits,
  type RecentVisit,
} from "./recent-visits";

export const WORKBENCH_VIEWS = [
  "mine",
  "today",
  "overdue",
  "review",
  "personal",
] as const;

export type WorkbenchView = (typeof WORKBENCH_VIEWS)[number];

export type WorkbenchTask = {
  id: string;
  taskNumber: number | null;
  projectId: string;
  projectName: string;
  teamName: string;
  title: string;
  workItemType: WorkItemType;
  priority: TaskPriority;
  status: "todo" | "doing" | "done";
  statusId: string | null;
  statusName: string | null;
  statusColor:
    | "slate"
    | "blue"
    | "amber"
    | "green"
    | "red"
    | "violet"
    | "pink"
    | null;
  startDate: string | null;
  dueDate: string | null;
  estimate: number | null;
  updatedAt: Date;
};

export type SubmittedWorkbenchReview = {
  id: string;
  taskId: string;
  projectId: string;
  projectName: string;
  teamName: string;
  taskTitle: string;
  statusName: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  submittedAt: Date;
};

export type WorkbenchTeam = {
  id: string;
  name: string;
  role: TeamRole;
};

export type WorkbenchProjectLoad = {
  projectId: string;
  projectName: string;
  teamName: string;
  total: number;
  todo: number;
  doing: number;
  overdue: number;
  today: number;
  estimate: number;
};

export type WorkbenchNotification = Awaited<
  ReturnType<typeof listMyNotifications>
>[number];

export type WorkbenchSummary = {
  assignedOpen: number;
  today: number;
  overdue: number;
  dueSoon: number;
  completedLast7Days: number;
  reviewQueue: number;
  submittedReviews: number;
  reviewAttention: number;
  unreadNotifications: number;
};

export type MyWorkbench = {
  today: string;
  tasks: WorkbenchTask[];
  todayTasks: WorkbenchTask[];
  overdueTasks: WorkbenchTask[];
  dueSoonTasks: WorkbenchTask[];
  reviewQueue: PendingTaskReview[];
  submittedReviews: SubmittedWorkbenchReview[];
  projectLoad: WorkbenchProjectLoad[];
  teams: WorkbenchTeam[];
  recentActivity: WorkbenchNotification[];
  recentVisits: RecentVisit[];
  summary: WorkbenchSummary;
};

export function resolveWorkbenchView(
  value: string | string[] | undefined,
): WorkbenchView {
  const candidate = Array.isArray(value) ? value[0] : value;
  return WORKBENCH_VIEWS.includes(candidate as WorkbenchView)
    ? (candidate as WorkbenchView)
    : "mine";
}

export function getAppToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assignedToMe(actorId: string) {
  return or(
    eq(tasks.assigneeId, actorId),
    exists(
      db
        .select({ taskId: taskAssignees.taskId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, tasks.id),
            eq(taskAssignees.userId, actorId),
          ),
        ),
    ),
  );
}

function myTaskScope(actorId: string) {
  return and(
    eq(teamMembers.userId, actorId),
    eq(projects.status, "active"),
    assignedToMe(actorId),
  );
}

function toProjectLoad(tasksInScope: WorkbenchTask[], today: string) {
  const byProject = new Map<string, WorkbenchProjectLoad>();

  for (const task of tasksInScope) {
    const current =
      byProject.get(task.projectId) ??
      ({
        projectId: task.projectId,
        projectName: task.projectName,
        teamName: task.teamName,
        total: 0,
        todo: 0,
        doing: 0,
        overdue: 0,
        today: 0,
        estimate: 0,
      } satisfies WorkbenchProjectLoad);

    current.total += 1;
    current.estimate += task.estimate ?? 0;
    if (task.status === "todo") current.todo += 1;
    if (task.status === "doing") current.doing += 1;
    if (task.dueDate === today) current.today += 1;
    if (task.dueDate !== null && task.dueDate < today) current.overdue += 1;
    byProject.set(task.projectId, current);
  }

  return [...byProject.values()].sort(
    (a, b) =>
      b.total - a.total ||
      b.overdue - a.overdue ||
      a.projectName.localeCompare(b.projectName, "zh-CN"),
  );
}

export async function getMyWorkbench(actorId: string): Promise<MyWorkbench> {
  const today = getAppToday();
  const soon = addDaysToDateKey(today, 7);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const openTasksQuery = db
    .select({
      id: tasks.id,
      taskNumber: tasks.taskNumber,
      projectId: tasks.projectId,
      projectName: projects.name,
      teamName: teams.name,
      title: tasks.title,
      workItemType: tasks.workItemType,
      priority: tasks.priority,
      status: tasks.status,
      statusId: tasks.statusId,
      statusName: workflowStatuses.name,
      statusColor: workflowStatuses.color,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      estimate: tasks.estimate,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(teams, eq(projects.teamId, teams.id))
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, projects.teamId),
        eq(teamMembers.userId, actorId),
      ),
    )
    .leftJoin(workflowStatuses, eq(tasks.statusId, workflowStatuses.id))
    .where(and(myTaskScope(actorId), ne(tasks.status, "done")))
    .orderBy(
      sql`case when ${tasks.dueDate} is null then 1 else 0 end`,
      asc(tasks.dueDate),
      desc(tasks.updatedAt),
    );

  const completedRecentQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, projects.teamId),
        eq(teamMembers.userId, actorId),
      ),
    )
    .where(
      and(
        myTaskScope(actorId),
        eq(tasks.status, "done"),
        gte(tasks.updatedAt, sevenDaysAgo),
      ),
    );

  const submittedReviewsQuery = db
    .select({
      id: taskReviewRequests.id,
      taskId: taskReviewRequests.taskId,
      projectId: taskReviewRequests.projectId,
      projectName: projects.name,
      teamName: teams.name,
      taskTitle: tasks.title,
      statusName: workflowStatuses.name,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
      submittedAt: taskReviewRequests.submittedAt,
    })
    .from(taskReviewRequests)
    .innerJoin(tasks, eq(taskReviewRequests.taskId, tasks.id))
    .innerJoin(projects, eq(taskReviewRequests.projectId, projects.id))
    .innerJoin(teams, eq(projects.teamId, teams.id))
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, projects.teamId),
        eq(teamMembers.userId, actorId),
      ),
    )
    .leftJoin(workflowStatuses, eq(tasks.statusId, workflowStatuses.id))
    .where(
      and(
        eq(taskReviewRequests.status, "pending"),
        eq(taskReviewRequests.submittedById, actorId),
        eq(projects.status, "active"),
      ),
    )
    .orderBy(asc(taskReviewRequests.submittedAt));

  const teamsQuery = db
    .select({
      id: teams.id,
      name: teams.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, actorId))
    .orderBy(asc(teams.name));

  const [
    taskRows,
    completedRecentRows,
    submittedReviews,
    reviewQueue,
    userTeams,
    recentActivity,
    recentVisits,
    unreadNotifications,
  ] = await Promise.all([
    openTasksQuery,
    completedRecentQuery,
    submittedReviewsQuery,
    listPendingTaskReviewsForAdmin(actorId),
    teamsQuery,
    listMyNotifications(actorId, 10),
    listRecentVisits(actorId, 6),
    countUnreadNotifications(actorId),
  ]);

  const openTasks = taskRows as WorkbenchTask[];
  const todayTasks = openTasks.filter((task) => task.dueDate === today);
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate !== null && task.dueDate < today,
  );
  const dueSoonTasks = openTasks.filter(
    (task) =>
      task.dueDate !== null && task.dueDate > today && task.dueDate <= soon,
  );
  const queueIds = new Set(reviewQueue.map((review) => review.id));
  const uniqueSubmittedCount = submittedReviews.filter(
    (review) => !queueIds.has(review.id),
  ).length;

  return {
    today,
    tasks: openTasks,
    todayTasks,
    overdueTasks,
    dueSoonTasks,
    reviewQueue,
    submittedReviews,
    projectLoad: toProjectLoad(openTasks, today),
    teams: userTeams,
    recentActivity,
    recentVisits,
    summary: {
      assignedOpen: openTasks.length,
      today: todayTasks.length,
      overdue: overdueTasks.length,
      dueSoon: dueSoonTasks.length,
      completedLast7Days: completedRecentRows[0]?.count ?? 0,
      reviewQueue: reviewQueue.length,
      submittedReviews: submittedReviews.length,
      reviewAttention: reviewQueue.length + uniqueSubmittedCount,
      unreadNotifications,
    },
  };
}
