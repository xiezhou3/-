import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRules,
  automationRuns,
  notifications,
  projects,
  taskAssignees,
  taskWatchers,
  teamMembers,
  type AutomationAction,
  type AutomationRunStatus,
  type AutomationTrigger,
  type BugSeverity,
  type TaskPriority,
  type TaskStatus,
  type WorkItemType,
} from "@/db/schema";
import { AppError, ForbiddenError, isUniqueViolation } from "./errors";
import { getProjectForUser } from "./project";
import { createTask, updateTask } from "./task";

export type AutomationConditions = {
  eventType?: string;
  eventStatus?: string;
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  workItemType?: WorkItemType;
  priority?: TaskPriority;
  releaseStatus?: string;
};

export type AutomationActionConfig = {
  recipient?: "admins" | "assignees" | "watchers" | "creator";
  status?: TaskStatus;
  bugSeverity?: BugSeverity;
  title?: string;
  body?: string;
};

export type AutomationEvent = {
  triggerType: AutomationTrigger;
  projectId: string;
  actorId: string;
  taskIds: string[];
  releaseId?: string | null;
  title: string;
  workItemType?: WorkItemType;
  priority?: TaskPriority;
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  releaseStatus?: string;
  externalEvent?: {
    id: string;
    eventType: string;
    status: string | null;
    provider: string;
    branch: string | null;
    environment: string | null;
  };
};

export const AUTOMATION_TEMPLATES = [
  {
    id: "ci-failure-bug",
    name: "CI 失败自动创建 Bug",
    description: "收到失败流水线时，在项目中创建一个高优先级 Bug。",
    triggerType: "external_event" as const,
    conditions: { eventType: "pipeline", eventStatus: "failure" },
    actionType: "create_bug" as const,
    actionConfig: {
      title: "CI 失败：{{title}}",
      body: "自动化规则根据失败的流水线事件创建。",
      bugSeverity: "major" as const,
    },
  },
  {
    id: "release-published-notify",
    name: "Release 发布通知管理员",
    description: "版本标记为已发布时，通知项目管理员。",
    triggerType: "release_status_changed" as const,
    conditions: { releaseStatus: "released" },
    actionType: "notify" as const,
    actionConfig: {
      recipient: "admins" as const,
      title: "Release 已发布：{{title}}",
      body: "自动化规则已检测到版本发布。",
    },
  },
  {
    id: "pr-merged-in-progress",
    name: "PR 合并推进任务",
    description: "Pull Request 合并后，将关联任务推进到进行中。",
    triggerType: "external_event" as const,
    conditions: { eventType: "pull_request", eventStatus: "merged" },
    actionType: "set_task_status" as const,
    actionConfig: { status: "doing" as const },
  },
  {
    id: "high-priority-done-notify",
    name: "高优先级任务完成通知",
    description: "高优先级任务完成时通知项目管理员。",
    triggerType: "task_status_changed" as const,
    conditions: { toStatus: "done" as const, priority: "high" as const },
    actionType: "notify" as const,
    actionConfig: {
      recipient: "admins" as const,
      title: "高优先级任务完成：{{title}}",
      body: "自动化规则已检测到任务完成。",
    },
  },
];

const AUTOMATION_WRITE_ROLES = ["admin", "student"];
let automationDepth = 0;

function requireWriteRole(access: { role: string }) {
  if (!AUTOMATION_WRITE_ROLES.includes(access.role)) {
    throw new ForbiddenError();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function listAutomationRules(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  const [rules, runs] = await Promise.all([
    db
      .select()
      .from(automationRules)
      .where(eq(automationRules.projectId, projectId))
      .orderBy(desc(automationRules.createdAt)),
    db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.projectId, projectId))
      .orderBy(desc(automationRuns.createdAt))
      .limit(40),
  ]);
  return { access, rules, runs };
}

export async function createAutomationRule(
  actorId: string,
  projectId: string,
  input: {
    name: string;
    description?: string;
    triggerType: AutomationTrigger;
    conditions: AutomationConditions;
    actionType: AutomationAction;
    actionConfig: AutomationActionConfig;
  },
) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  requireWriteRole(access);
  try {
    const [rule] = await db
      .insert(automationRules)
      .values({
        projectId,
        name: input.name.trim().slice(0, 120),
        description: input.description?.trim().slice(0, 1000) || null,
        triggerType: input.triggerType,
        conditions: input.conditions,
        actionType: input.actionType,
        actionConfig: input.actionConfig,
        createdById: actorId,
      })
      .returning();
    return rule;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("自动化规则名称已存在");
    throw error;
  }
}

export async function setAutomationRuleEnabled(
  actorId: string,
  ruleId: string,
  enabled: boolean,
) {
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId));
  if (!rule) throw new AppError("自动化规则不存在");
  const access = await getProjectForUser(actorId, rule.projectId);
  if (!access) throw new ForbiddenError();
  requireWriteRole(access);
  const [updated] = await db
    .update(automationRules)
    .set({ enabled, updatedAt: sql`now()` })
    .where(eq(automationRules.id, ruleId))
    .returning();
  return updated;
}

export async function deleteAutomationRule(actorId: string, ruleId: string) {
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId));
  if (!rule) throw new AppError("自动化规则不存在");
  const access = await getProjectForUser(actorId, rule.projectId);
  if (!access) throw new ForbiddenError();
  requireWriteRole(access);
  await db.delete(automationRules).where(eq(automationRules.id, ruleId));
}

function matchesConditions(
  conditions: AutomationConditions,
  event: AutomationEvent,
) {
  if (
    conditions.eventType &&
    event.externalEvent?.eventType !== conditions.eventType
  ) {
    return false;
  }
  if (
    conditions.eventStatus &&
    (event.externalEvent?.status ?? "").toLowerCase() !==
      conditions.eventStatus.toLowerCase()
  ) {
    return false;
  }
  if (conditions.fromStatus && event.fromStatus !== conditions.fromStatus) {
    return false;
  }
  if (conditions.toStatus && event.toStatus !== conditions.toStatus) {
    return false;
  }
  if (
    conditions.workItemType &&
    event.workItemType !== conditions.workItemType
  ) {
    return false;
  }
  if (conditions.priority && event.priority !== conditions.priority) {
    return false;
  }
  if (
    conditions.releaseStatus &&
    event.releaseStatus !== conditions.releaseStatus
  ) {
    return false;
  }
  return true;
}

function renderTemplate(template: string | undefined, fallback: string, event: AutomationEvent) {
  return (template || fallback)
    .replaceAll("{{title}}", event.title)
    .replaceAll("{{eventType}}", event.externalEvent?.eventType ?? "")
    .replaceAll("{{status}}", event.externalEvent?.status ?? event.toStatus ?? "");
}

async function recipientIds(
  rule: typeof automationRules.$inferSelect,
  event: AutomationEvent,
  mode: AutomationActionConfig["recipient"],
) {
  if (mode === "creator") return rule.createdById ? [rule.createdById] : [];
  if (mode === "admins") {
    const project = await db
      .select({ teamId: projects.teamId })
      .from(projects)
      .where(eq(projects.id, event.projectId));
    if (!project[0]) return [];
    const rows = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, project[0].teamId),
          eq(teamMembers.role, "admin"),
        ),
      );
    return rows.map((row) => row.userId);
  }
  if (event.taskIds.length === 0) return [];
  if (mode === "watchers") {
    const rows = await db
      .select({ userId: taskWatchers.userId })
      .from(taskWatchers)
      .where(inArray(taskWatchers.taskId, event.taskIds));
    return rows.map((row) => row.userId);
  }
  const rows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(inArray(taskAssignees.taskId, event.taskIds));
  return rows.map((row) => row.userId);
}

async function executeAction(
  rule: typeof automationRules.$inferSelect,
  event: AutomationEvent,
) {
  const config = asRecord(rule.actionConfig) as AutomationActionConfig;
  if (rule.actionType === "create_bug") {
    const task = await createTask(rule.createdById ?? event.actorId, event.projectId, {
      title: renderTemplate(config.title, `自动化：${event.title}`, event),
      description: renderTemplate(
        config.body,
        `由自动化规则「${rule.name}」创建。`,
        event,
      ),
      workItemType: "bug",
      bugSeverity: config.bugSeverity ?? "major",
      priority: "high",
    });
    return `已创建 Bug #${task.taskNumber ?? task.id.slice(0, 8)}`;
  }
  if (rule.actionType === "set_task_status") {
    if (event.taskIds.length === 0 || !config.status) {
      return { skipped: "没有可更新的关联任务" };
    }
    for (const taskId of event.taskIds) {
      await updateTask(rule.createdById ?? event.actorId, taskId, {
        status: config.status,
      });
    }
    return `已更新 ${event.taskIds.length} 个任务状态`;
  }

  const recipients = await recipientIds(
    rule,
    event,
    config.recipient ?? "admins",
  );
  const recipientMode = config.recipient ?? "admins";
  const uniqueRecipients = [
    ...new Set(
      recipientMode === "admins"
        ? recipients
        : recipients.filter((userId) => userId !== event.actorId),
    ),
  ];
  if (uniqueRecipients.length === 0) {
    return { skipped: "没有符合条件的通知接收人" };
  }
  await db.insert(notifications).values(
    uniqueRecipients.map((userId) => ({
      userId,
      projectId: event.projectId,
      taskId: event.taskIds[0] ?? null,
      actorId: event.actorId,
      type: "automation" as const,
      title: renderTemplate(
        config.title,
        `自动化：${event.title}`,
        event,
      ).slice(0, 500),
      body: renderTemplate(config.body, rule.name, event).slice(0, 2000),
    })),
  );
  return `已通知 ${uniqueRecipients.length} 名成员`;
}

export async function runAutomationsForEvent(event: AutomationEvent) {
  if (automationDepth > 0) return;
  automationDepth += 1;
  try {
    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.projectId, event.projectId),
          eq(automationRules.triggerType, event.triggerType),
          eq(automationRules.enabled, true),
        ),
      );
    for (const rule of rules) {
      if (!matchesConditions(asRecord(rule.conditions) as AutomationConditions, event)) {
        continue;
      }
      let status: AutomationRunStatus = "success";
      let message = "";
      try {
        const result = await executeAction(rule, event);
        if (typeof result === "object") {
          status = "skipped";
          message = result.skipped;
        } else {
          message = result;
        }
      } catch (error) {
        status = "failed";
        message = error instanceof Error ? error.message : "执行失败";
      }
      await db.insert(automationRuns).values({
        projectId: event.projectId,
        ruleId: rule.id,
        ruleName: rule.name,
        triggerType: event.triggerType,
        status,
        summary: event.title,
        message,
        payload: event,
      });
      await db
        .update(automationRules)
        .set({ lastRunAt: sql`now()` })
        .where(eq(automationRules.id, rule.id));
    }
  } finally {
    automationDepth -= 1;
  }
}
