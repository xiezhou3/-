import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRules,
  type AutomationTrigger,
  type TaskPriority,
  type TaskStatus,
  type WorkItemType,
} from "@/db/schema";
import type { AutomationEvent } from "./automation";

async function hasEnabledRule(projectId: string, triggerType: AutomationTrigger) {
  const [rule] = await db
    .select({ id: automationRules.id })
    .from(automationRules)
    .where(
      and(
        eq(automationRules.projectId, projectId),
        eq(automationRules.triggerType, triggerType),
        eq(automationRules.enabled, true),
      ),
    )
    .limit(1);
  return Boolean(rule);
}

async function trigger(event: AutomationEvent) {
  try {
    if (!(await hasEnabledRule(event.projectId, event.triggerType))) return;
    const { runAutomationsForEvent } = await import("./automation");
    await runAutomationsForEvent(event);
  } catch (error) {
    console.error("[automation] trigger failed", error);
  }
}

export async function triggerTaskStatusAutomation(input: {
  actorId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  workItemType: WorkItemType;
  priority: TaskPriority;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
}) {
  await trigger({
    triggerType: "task_status_changed",
    projectId: input.projectId,
    actorId: input.actorId,
    taskIds: [input.taskId],
    title: input.taskTitle,
    workItemType: input.workItemType,
    priority: input.priority,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
  });
}

export async function triggerExternalEventAutomation(input: {
  actorId: string;
  projectId: string;
  eventId: string;
  title: string;
  eventType: string;
  status: string | null;
  provider: string;
  branch: string | null;
  environment: string | null;
  taskIds: string[];
  releaseId: string | null;
}) {
  await trigger({
    triggerType: "external_event",
    projectId: input.projectId,
    actorId: input.actorId,
    taskIds: input.taskIds,
    releaseId: input.releaseId,
    title: input.title,
    externalEvent: {
      id: input.eventId,
      eventType: input.eventType,
      status: input.status,
      provider: input.provider,
      branch: input.branch,
      environment: input.environment,
    },
  });
}

export async function triggerReleaseStatusAutomation(input: {
  actorId: string;
  projectId: string;
  releaseId: string;
  releaseName: string;
  releaseStatus: string;
  previousStatus: string;
}) {
  if (input.releaseStatus === input.previousStatus) return;
  await trigger({
    triggerType: "release_status_changed",
    projectId: input.projectId,
    actorId: input.actorId,
    taskIds: [],
    releaseId: input.releaseId,
    title: input.releaseName,
    releaseStatus: input.releaseStatus,
  });
}
