import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  releases,
  tasks,
  teamMembers,
  teams,
  workflowStatuses,
} from "@/db/schema";
import { ensureProjectTaskNumbers } from "./task";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GlobalTaskResult = {
  id: string;
  taskNumber: number | null;
  title: string;
  projectId: string;
  projectName: string;
  teamName: string;
  workItemType: string;
  status: string;
  statusName: string | null;
  dueDate: string | null;
  updatedAt: Date;
};

export type GlobalProjectResult = {
  id: string;
  name: string;
  description: string | null;
  teamName: string;
  status: "active" | "archived";
};

export type GlobalTeamResult = {
  id: string;
  name: string;
  role: "admin" | "teacher" | "student";
};

export type GlobalReleaseResult = {
  id: string;
  name: string;
  description: string | null;
  status: "planned" | "active" | "released" | "cancelled";
  targetDate: string | null;
  projectId: string;
  projectName: string;
};

export type GlobalSearchResults = {
  query: string;
  taskNumber: number | null;
  tasks: GlobalTaskResult[];
  projects: GlobalProjectResult[];
  teams: GlobalTeamResult[];
  releases: GlobalReleaseResult[];
};

export function taskNumberFromQuery(query: string) {
  const normalized = query.trim().replace(/^#/, "");
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

async function accessibleProjectIds(actorId: string) {
  const rows = await db
    .select({ projectId: projects.id })
    .from(projects)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, projects.teamId),
        eq(teamMembers.userId, actorId),
      ),
    );
  return rows.map((row) => row.projectId);
}

async function backfillAccessibleTaskNumbers(
  projectIds: string[],
) {
  if (projectIds.length === 0) return;
  const rows = await db
    .selectDistinct({ projectId: tasks.projectId })
    .from(tasks)
    .where(
      and(
        inArray(tasks.projectId, projectIds),
        isNull(tasks.taskNumber),
      ),
    );
  for (const row of rows) {
    await ensureProjectTaskNumbers(row.projectId);
  }
}

export async function searchGlobally(
  actorId: string,
  rawQuery: string,
): Promise<GlobalSearchResults> {
  const query = rawQuery.trim().slice(0, 100);
  if (!query) {
    return {
      query,
      taskNumber: null,
      tasks: [],
      projects: [],
      teams: [],
      releases: [],
    };
  }

  const projectIds = await accessibleProjectIds(actorId);
  await backfillAccessibleTaskNumbers(projectIds);
  if (projectIds.length === 0) {
    return {
      query,
      taskNumber: taskNumberFromQuery(query),
      tasks: [],
      projects: [],
      teams: [],
      releases: [],
    };
  }

  const taskNumber = taskNumberFromQuery(query);
  const pattern = likePattern(query.replace(/^#/, ""));
  const exactId = UUID_RE.test(query) ? query : null;
  const taskCondition = or(
    ilike(tasks.title, pattern),
    ilike(tasks.description, pattern),
    taskNumber !== null ? eq(tasks.taskNumber, taskNumber) : undefined,
    exactId ? eq(tasks.id, exactId) : undefined,
  );

  const [taskRows, projectRows, teamRows, releaseRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        taskNumber: tasks.taskNumber,
        title: tasks.title,
        projectId: tasks.projectId,
        projectName: projects.name,
        teamName: teams.name,
        workItemType: tasks.workItemType,
        status: tasks.status,
        statusName: workflowStatuses.name,
        dueDate: tasks.dueDate,
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
      .where(and(taskCondition))
      .orderBy(desc(tasks.updatedAt))
      .limit(15),
    db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        teamName: teams.name,
        status: projects.status,
      })
      .from(projects)
      .innerJoin(teams, eq(projects.teamId, teams.id))
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.teamId, projects.teamId),
          eq(teamMembers.userId, actorId),
        ),
      )
      .where(
        or(
          ilike(projects.name, pattern),
          ilike(projects.description, pattern),
        ),
      )
      .orderBy(desc(projects.createdAt))
      .limit(10),
    db
      .select({
        id: teams.id,
        name: teams.name,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(
        and(
          eq(teamMembers.userId, actorId),
          ilike(teams.name, pattern),
        ),
      )
      .orderBy(teams.name)
      .limit(10),
    db
      .select({
        id: releases.id,
        name: releases.name,
        description: releases.description,
        status: releases.status,
        targetDate: releases.targetDate,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(releases)
      .innerJoin(projects, eq(releases.projectId, projects.id))
      .innerJoin(
        teamMembers,
        and(
          eq(teamMembers.teamId, projects.teamId),
          eq(teamMembers.userId, actorId),
        ),
      )
      .where(
        or(
          ilike(releases.name, pattern),
          ilike(releases.description, pattern),
        ),
      )
      .orderBy(desc(releases.updatedAt))
      .limit(10),
  ]);

  return {
    query,
    taskNumber,
    tasks: taskRows as GlobalTaskResult[],
    projects: projectRows as GlobalProjectResult[],
    teams: teamRows as GlobalTeamResult[],
    releases: releaseRows as GlobalReleaseResult[],
  };
}
