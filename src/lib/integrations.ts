import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  externalEventTasks,
  externalEvents,
  projectIntegrations,
  releases,
  tasks,
  type IntegrationProvider,
  type IntegrationStatus,
} from "@/db/schema";
import { AppError, ForbiddenError, isUniqueViolation } from "./errors";
import { getProjectForUser } from "./project";
import { getTaskDetail, ensureProjectTaskNumbers, listProjectTasks } from "./task";
import {
  buildReleaseSummaries,
  listProjectReleases,
  type ReleaseSummary,
} from "./planning";
import { triggerExternalEventAutomation } from "./automation-trigger";

const INTEGRATION_WRITE_ROLES = ["admin", "student"];

export type ProjectIntegration = typeof projectIntegrations.$inferSelect;

export type ExternalEventView = {
  id: string;
  integrationId: string;
  integrationName: string;
  provider: IntegrationProvider;
  eventType: string;
  action: string | null;
  title: string;
  url: string | null;
  actor: string | null;
  branch: string | null;
  commitSha: string | null;
  environment: string | null;
  status: string | null;
  releaseId: string | null;
  occurredAt: Date;
  createdAt: Date;
  taskIds: string[];
  taskTitles: string[];
};

export type IntegrationOverview = {
  integrations: ProjectIntegration[];
  events: ExternalEventView[];
};

export type ReleaseDelivery = {
  release: ReleaseSummary;
  tasks: Awaited<ReturnType<typeof listProjectTasks>>;
  events: ExternalEventView[];
};

type NormalizedExternalEvent = {
  eventType: string;
  action: string | null;
  title: string;
  url: string | null;
  actor: string | null;
  branch: string | null;
  commitSha: string | null;
  environment: string | null;
  status: string | null;
  occurredAt: Date;
  taskNumbers: number[];
  releaseId: string | null;
  releaseName: string | null;
};

const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  ci: "CI/CD",
  webhook: "通用 Webhook",
};

function requireWriteRole(access: { role: string }) {
  if (!INTEGRATION_WRITE_ROLES.includes(access.role)) {
    throw new ForbiddenError();
  }
}

function stringValue(value: unknown, max = 500) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function collectTaskNumbers(...values: Array<string | null | undefined>) {
  const numbers = new Set<number>();
  for (const value of values) {
    if (!value) continue;
    for (const match of value.matchAll(/(?:#|task[-_/ ])(\d+)\b/gi)) {
      const number = Number(match[1]);
      if (Number.isSafeInteger(number) && number > 0) numbers.add(number);
    }
  }
  return [...numbers];
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

export function normalizeExternalEvent(
  provider: IntegrationProvider,
  eventHeader: string | null,
  payload: unknown,
): NormalizedExternalEvent {
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  if (provider === "github") {
    const event = eventHeader?.toLowerCase() ?? "github";
    const repository = body.repository as Record<string, unknown> | undefined;
    if (event === "pull_request") {
      const pr = (body.pull_request ?? {}) as Record<string, unknown>;
      const head = (pr.head ?? {}) as Record<string, unknown>;
      const title = stringValue(pr.title) ?? "Pull Request";
      return {
        eventType: "pull_request",
        action: stringValue(body.action, 60),
        title: `PR #${String(pr.number ?? "")} · ${title}`,
        url: stringValue(pr.html_url, 1000),
        actor: stringValue((body.sender as Record<string, unknown> | undefined)?.login, 120),
        branch: stringValue(head.ref, 200),
        commitSha:
          stringValue(pr.merge_commit_sha, 80) ??
          stringValue(head.sha, 80),
        environment: null,
        status: pr.merged === true ? "merged" : stringValue(pr.state, 40),
        occurredAt: dateValue(body.pull_request && pr.updated_at),
        taskNumbers: collectTaskNumbers(
          title,
          stringValue(pr.body, 4000),
          stringValue(head.ref, 200),
        ),
        releaseId: stringValue(body.releaseId, 80),
        releaseName: stringValue(body.releaseName, 120),
      };
    }
    if (event === "push") {
      const ref = stringValue(body.ref, 200)?.replace(/^refs\/heads\//, "") ?? null;
      const commits = Array.isArray(body.commits)
        ? (body.commits as Array<Record<string, unknown>>)
        : [];
      const headCommit = (body.head_commit ?? {}) as Record<string, unknown>;
      const message =
        stringValue(headCommit.message, 1000) ??
        stringValue(commits.at(-1)?.message, 1000);
      return {
        eventType: "push",
        action: "pushed",
        title: message ?? `推送到 ${ref ?? "仓库"}`,
        url: stringValue(repository?.html_url, 1000),
        actor: stringValue((body.pusher as Record<string, unknown> | undefined)?.name, 120),
        branch: ref,
        commitSha: stringValue(body.after, 80),
        environment: null,
        status: "pushed",
        occurredAt: new Date(),
        taskNumbers: collectTaskNumbers(message, ref),
        releaseId: stringValue(body.releaseId, 80),
        releaseName: stringValue(body.releaseName, 120),
      };
    }
    if (event === "workflow_run" || event === "workflow_job") {
      const run =
        ((body.workflow_run ?? body.workflow_job) ?? {}) as Record<string, unknown>;
      return {
        eventType: "pipeline",
        action: event,
        title: stringValue(run.name, 200) ?? "GitHub Actions",
        url: stringValue(run.html_url, 1000),
        actor:
          stringValue((run.actor as Record<string, unknown> | undefined)?.login, 120) ??
          stringValue((body.sender as Record<string, unknown> | undefined)?.login, 120),
        branch: stringValue(run.head_branch, 200),
        commitSha: stringValue(run.head_sha, 80),
        environment: null,
        status:
          stringValue(run.conclusion, 60) ??
          stringValue(run.status, 60),
        occurredAt: dateValue(run.updated_at),
        taskNumbers: collectTaskNumbers(
          stringValue(run.head_branch, 200),
          stringValue(run.display_title, 500),
        ),
        releaseId: stringValue(body.releaseId, 80),
        releaseName: stringValue(body.releaseName, 120),
      };
    }
    if (event === "deployment_status") {
      const deployment = (body.deployment ?? {}) as Record<string, unknown>;
      const status = (body.deployment_status ?? {}) as Record<string, unknown>;
      const environment = stringValue(deployment.environment, 200);
      return {
        eventType: "deployment",
        action: stringValue(status.state, 60),
        title: `部署到 ${environment ?? "环境"}`,
        url: stringValue(status.target_url, 1000),
        actor: stringValue((body.sender as Record<string, unknown> | undefined)?.login, 120),
        branch: stringValue(deployment.ref, 200),
        commitSha: stringValue(deployment.sha, 80),
        environment,
        status: stringValue(status.state, 60),
        occurredAt: dateValue(status.updated_at),
        taskNumbers: collectTaskNumbers(stringValue(deployment.ref, 200)),
        releaseId: stringValue(body.releaseId, 80),
        releaseName: stringValue(body.releaseName, 120),
      };
    }
  }

  if (provider === "gitlab") {
    const kind = stringValue(body.object_kind, 80) ?? eventHeader;
    if (kind === "merge_request") {
      const attrs = (body.object_attributes ?? {}) as Record<string, unknown>;
      const title = stringValue(attrs.title) ?? "Merge Request";
      const user = (body.user ?? {}) as Record<string, unknown>;
      return {
        eventType: "pull_request",
        action: stringValue(attrs.action, 60),
        title: `MR !${String(attrs.iid ?? "")} · ${title}`,
        url: stringValue(attrs.url, 1000),
        actor: stringValue(user.name, 120),
        branch: stringValue(attrs.source_branch, 200),
        commitSha: stringValue(attrs.last_commit_id, 80),
        environment: null,
        status:
          attrs.state === "merged"
            ? "merged"
            : stringValue(attrs.state, 40),
        occurredAt: dateValue(attrs.updated_at),
        taskNumbers: collectTaskNumbers(
          title,
          stringValue(attrs.description, 4000),
          stringValue(attrs.source_branch, 200),
        ),
        releaseId: stringValue(body.releaseId, 80),
        releaseName: stringValue(body.releaseName, 120),
      };
    }
    if (kind === "pipeline") {
      const attrs = (body.object_attributes ?? {}) as Record<string, unknown>;
      const project = (body.project ?? {}) as Record<string, unknown>;
      const user = (body.user ?? {}) as Record<string, unknown>;
      return {
        eventType: "pipeline",
        action: "pipeline",
        title: `Pipeline #${String(attrs.id ?? "")}`,
        url:
          stringValue(project.web_url, 900) && attrs.id
            ? `${String(project.web_url)}/-/pipelines/${String(attrs.id)}`
            : stringValue(project.web_url, 1000),
        actor: stringValue(user.name, 120),
        branch: stringValue(attrs.ref, 200),
        commitSha: stringValue(attrs.sha, 80),
        environment: null,
        status: stringValue(attrs.status, 60),
        occurredAt: dateValue(attrs.updated_at),
        taskNumbers: collectTaskNumbers(stringValue(attrs.ref, 200)),
        releaseId: stringValue(body.releaseId, 80),
        releaseName: stringValue(body.releaseName, 120),
      };
    }
    if (kind === "deployment") {
      const status = stringValue(body.status, 60);
      const environment = stringValue(body.environment, 200);
      const user = (body.user ?? {}) as Record<string, unknown>;
      return {
        eventType: "deployment",
        action: status,
        title: `部署到 ${environment ?? "环境"}`,
        url: stringValue(body.deployment_url, 1000),
        actor: stringValue(user.name, 120),
        branch: stringValue(body.ref, 200),
        commitSha: stringValue(body.sha, 80),
        environment,
        status,
        occurredAt: dateValue(body.updated_at),
        taskNumbers: collectTaskNumbers(stringValue(body.ref, 200)),
        releaseId: stringValue(body.releaseId, 80),
        releaseName: stringValue(body.releaseName, 120),
      };
    }
  }

  const message = stringValue(body.message, 2000);
  const title =
    stringValue(body.title, 500) ??
    stringValue(body.name, 500) ??
    message ??
    `${PROVIDER_LABEL[provider]} event`;
  return {
    eventType:
      stringValue(body.eventType, 100) ??
      stringValue(body.event, 100) ??
      "event",
    action: stringValue(body.action, 100),
    title,
    url: stringValue(body.url, 1000),
    actor: stringValue(body.actor, 120),
    branch: stringValue(body.branch, 200),
    commitSha: stringValue(body.commitSha, 80),
    environment: stringValue(body.environment, 200),
    status: stringValue(body.status, 80),
    occurredAt: dateValue(body.occurredAt ?? body.timestamp),
    taskNumbers: [
      ...new Set([
        ...collectTaskNumbers(
          title,
          message,
          stringValue(body.branch, 200),
          stringValue(body.url, 1000),
        ),
        ...(Array.isArray(body.taskNumbers)
          ? body.taskNumbers
              .map(Number)
              .filter(
                (value) =>
                  Number.isSafeInteger(value) && value > 0,
              )
          : []),
      ]),
    ],
    releaseId: stringValue(body.releaseId, 80),
    releaseName: stringValue(body.releaseName, 120),
  };
}

export async function listProjectIntegrations(
  actorId: string,
  projectId: string,
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return {
    access,
    integrations: await db
      .select()
      .from(projectIntegrations)
      .where(eq(projectIntegrations.projectId, projectId))
      .orderBy(projectIntegrations.provider),
  };
}

export async function upsertProjectIntegration(
  actorId: string,
  projectId: string,
  provider: IntegrationProvider,
  input: {
    name?: string;
    repositoryUrl?: string;
    status?: IntegrationStatus;
  },
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  requireWriteRole(access);
  try {
    const [integration] = await db
      .insert(projectIntegrations)
      .values({
        projectId,
        provider,
        name: input.name?.trim() || PROVIDER_LABEL[provider],
        repositoryUrl: input.repositoryUrl?.trim() || null,
        webhookKey: nanoid(32),
        status: input.status ?? "active",
        createdById: actorId,
      })
      .onConflictDoUpdate({
        target: [projectIntegrations.projectId, projectIntegrations.provider],
        set: {
          ...(input.name !== undefined && {
            name: input.name.trim() || PROVIDER_LABEL[provider],
          }),
          ...(input.repositoryUrl !== undefined && {
            repositoryUrl: input.repositoryUrl.trim() || null,
          }),
          ...(input.status !== undefined && { status: input.status }),
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return integration;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("集成配置冲突，请重试");
    throw error;
  }
}

export async function rotateIntegrationKey(
  actorId: string,
  integrationId: string,
) {
  const [integration] = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.id, integrationId));
  if (!integration) throw new AppError("集成不存在");
  const access = await getProjectForUser(actorId, integration.projectId);
  if (!access) throw new ForbiddenError();
  requireWriteRole(access);
  const [updated] = await db
    .update(projectIntegrations)
    .set({ webhookKey: nanoid(32), updatedAt: sql`now()` })
    .where(eq(projectIntegrations.id, integrationId))
    .returning();
  return updated;
}

export async function sendTestIntegrationEvent(
  actorId: string,
  integrationId: string,
) {
  const [integration] = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.id, integrationId));
  if (!integration) throw new AppError("集成不存在");
  const access = await getProjectForUser(actorId, integration.projectId);
  if (!access) throw new ForbiddenError();
  requireWriteRole(access);
  return ingestExternalEvent(integration.webhookKey, {
    eventHeader: "test",
    payload: {
      event: "test",
      title: `${integration.name} 测试事件`,
      message: "这是一条用于验证集成链路的测试事件。",
      status: "success",
      actor: "AgileCampus",
      branch: "feat/demo",
      commitSha: "demo0000",
    },
  });
}

async function eventTasks(eventIds: string[]) {
  if (eventIds.length === 0) return new Map<string, { id: string; title: string }[]>();
  const rows = await db
    .select({
      eventId: externalEventTasks.eventId,
      taskId: tasks.id,
      taskTitle: tasks.title,
    })
    .from(externalEventTasks)
    .innerJoin(tasks, eq(externalEventTasks.taskId, tasks.id))
    .where(inArray(externalEventTasks.eventId, eventIds));
  const map = new Map<string, { id: string; title: string }[]>();
  for (const row of rows) {
    const list = map.get(row.eventId) ?? [];
    list.push({ id: row.taskId, title: row.taskTitle });
    map.set(row.eventId, list);
  }
  return map;
}

export async function listProjectExternalEvents(
  actorId: string,
  projectId: string,
  limit = 30,
): Promise<ExternalEventView[]> {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  const rows = await db
    .select({
      id: externalEvents.id,
      integrationId: externalEvents.integrationId,
      integrationName: projectIntegrations.name,
      provider: externalEvents.provider,
      eventType: externalEvents.eventType,
      action: externalEvents.action,
      title: externalEvents.title,
      url: externalEvents.url,
      actor: externalEvents.actor,
      branch: externalEvents.branch,
      commitSha: externalEvents.commitSha,
      environment: externalEvents.environment,
      status: externalEvents.status,
      releaseId: externalEvents.releaseId,
      occurredAt: externalEvents.occurredAt,
      createdAt: externalEvents.createdAt,
    })
    .from(externalEvents)
    .innerJoin(
      projectIntegrations,
      eq(externalEvents.integrationId, projectIntegrations.id),
    )
    .where(eq(externalEvents.projectId, projectId))
    .orderBy(desc(externalEvents.createdAt))
    .limit(limit);
  const linked = await eventTasks(rows.map((row) => row.id));
  return rows.map((row) => {
    const taskRows = linked.get(row.id) ?? [];
    return {
      ...row,
      taskIds: taskRows.map((task) => task.id),
      taskTitles: taskRows.map((task) => task.title),
    };
  });
}

export async function listTaskExternalEvents(actorId: string, taskId: string) {
  const task = await getTaskDetail(actorId, taskId);
  const rows = await db
    .select({ eventId: externalEventTasks.eventId })
    .from(externalEventTasks)
    .where(eq(externalEventTasks.taskId, taskId));
  const eventIds = rows.map((row) => row.eventId);
  if (eventIds.length === 0) return [];
  return db
    .select({
      id: externalEvents.id,
      provider: externalEvents.provider,
      eventType: externalEvents.eventType,
      action: externalEvents.action,
      title: externalEvents.title,
      url: externalEvents.url,
      actor: externalEvents.actor,
      branch: externalEvents.branch,
      commitSha: externalEvents.commitSha,
      environment: externalEvents.environment,
      status: externalEvents.status,
      occurredAt: externalEvents.occurredAt,
    })
    .from(externalEvents)
    .where(
      and(
        eq(externalEvents.projectId, task.projectId),
        inArray(externalEvents.id, eventIds),
      ),
    )
    .orderBy(desc(externalEvents.occurredAt))
    .limit(20);
}

export async function getIntegrationOverview(
  actorId: string,
  projectId: string,
): Promise<IntegrationOverview> {
  const { integrations } = await listProjectIntegrations(actorId, projectId);
  const events = await listProjectExternalEvents(actorId, projectId, 30);
  return { integrations, events };
}

async function resolveReleaseId(
  projectId: string,
  normalized: NormalizedExternalEvent,
  linkedTaskIds: string[],
) {
  if (normalized.releaseId) {
    const [release] = await db
      .select({ id: releases.id })
      .from(releases)
      .where(
        and(
          eq(releases.id, normalized.releaseId),
          eq(releases.projectId, projectId),
        ),
      );
    if (release) return release.id;
  }
  if (normalized.releaseName) {
    const [release] = await db
      .select({ id: releases.id })
      .from(releases)
      .where(
        and(
          eq(releases.projectId, projectId),
          eq(releases.name, normalized.releaseName),
        ),
      );
    if (release) return release.id;
  }
  if (linkedTaskIds.length > 0) {
    const [task] = await db
      .select({ releaseId: tasks.releaseId })
      .from(tasks)
      .where(inArray(tasks.id, linkedTaskIds));
    return task?.releaseId ?? null;
  }
  return null;
}

export async function ingestExternalEvent(
  webhookKey: string,
  input: {
    eventHeader: string | null;
    payload: unknown;
  },
) {
  const [integration] = await db
    .select()
    .from(projectIntegrations)
    .where(eq(projectIntegrations.webhookKey, webhookKey));
  if (!integration || integration.status !== "active") {
    throw new ForbiddenError("Webhook 无效或已停用");
  }
  const normalized = normalizeExternalEvent(
    integration.provider,
    input.eventHeader,
    input.payload,
  );
  await ensureProjectTaskNumbers(integration.projectId);
  const linkedTasks =
    normalized.taskNumbers.length === 0
      ? []
      : await db
          .select({ id: tasks.id, releaseId: tasks.releaseId })
          .from(tasks)
          .where(
            and(
              eq(tasks.projectId, integration.projectId),
              inArray(tasks.taskNumber, normalized.taskNumbers),
            ),
          );
  const linkedTaskIds = linkedTasks.map((task) => task.id);
  const releaseId =
    linkedTasks.find((task) => task.releaseId)?.releaseId ??
    (await resolveReleaseId(
      integration.projectId,
      normalized,
      linkedTaskIds,
    ));

  const event = await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(externalEvents)
      .values({
        projectId: integration.projectId,
        integrationId: integration.id,
        releaseId,
        provider: integration.provider,
        eventType: normalized.eventType.slice(0, 100),
        action: normalized.action,
        title: normalized.title.slice(0, 500),
        url: normalized.url,
        actor: normalized.actor,
        branch: normalized.branch,
        commitSha: normalized.commitSha,
        environment: normalized.environment,
        status: normalized.status,
        payload: input.payload,
        occurredAt: normalized.occurredAt,
      })
      .returning();
    if (linkedTaskIds.length > 0) {
      await tx.insert(externalEventTasks).values(
        linkedTaskIds.map((taskId) => ({
          eventId: event.id,
          taskId,
        })),
      );
    }
    await tx
      .update(projectIntegrations)
      .set({ lastEventAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(projectIntegrations.id, integration.id));
    return event;
  });
  await triggerExternalEventAutomation({
    actorId: integration.createdById ?? "",
    projectId: integration.projectId,
    eventId: event.id,
    title: normalized.title,
    eventType: normalized.eventType,
    status: normalized.status,
    provider: integration.provider,
    branch: normalized.branch,
    environment: normalized.environment,
    taskIds: linkedTaskIds,
    releaseId,
  });
  return event;
}

export async function getReleaseDelivery(
  actorId: string,
  releaseId: string,
): Promise<ReleaseDelivery | null> {
  const [release] = await db
    .select()
    .from(releases)
    .where(eq(releases.id, releaseId));
  if (!release) return null;
  const access = await getProjectForUser(actorId, release.projectId);
  if (!access) return null;
  const [releaseRows, taskRows, projectEvents] = await Promise.all([
    listProjectReleases(actorId, release.projectId),
    listProjectTasks(actorId, release.projectId),
    listProjectExternalEvents(actorId, release.projectId, 100),
  ]);
  const summary = buildReleaseSummaries(releaseRows, taskRows).find(
    (item) => item.id === releaseId,
  );
  if (!summary) return null;
  const releaseTaskIds = new Set(
    taskRows
      .filter((task) => task.releaseId === releaseId)
      .map((task) => task.id),
  );
  return {
    release: summary,
    tasks: taskRows.filter((task) => task.releaseId === releaseId),
    events: projectEvents.filter(
      (event) =>
        event.releaseId === releaseId ||
        event.taskIds.some((taskId) => releaseTaskIds.has(taskId)),
    ),
  };
}

export function defaultIntegrationName(provider: IntegrationProvider) {
  return PROVIDER_LABEL[provider];
}
