"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  AUTOMATION_TEMPLATES,
  createAutomationRule,
  deleteAutomationRule,
  setAutomationRuleEnabled,
  type AutomationActionConfig,
  type AutomationConditions,
} from "@/lib/automation";

export type AutomationActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

const optionalText = z.string().trim().optional();
const createSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "请填写规则名称").max(120, "规则名称最多 120 字"),
  description: optionalText,
  triggerType: z.enum([
    "task_status_changed",
    "external_event",
    "release_status_changed",
  ]),
  eventType: optionalText,
  eventStatus: optionalText,
  conditionFromStatus: z.enum(["todo", "doing", "done"]).optional(),
  conditionToStatus: z.enum(["todo", "doing", "done"]).optional(),
  conditionWorkItemType: z
    .enum(["epic", "story", "task", "bug"])
    .optional(),
  conditionPriority: z.enum(["low", "medium", "high"]).optional(),
  conditionReleaseStatus: z
    .enum(["planned", "active", "released", "cancelled"])
    .optional(),
  actionType: z.enum(["notify", "create_bug", "set_task_status"]),
  recipient: z.enum(["admins", "assignees", "watchers", "creator"]).optional(),
  actionTaskStatus: z.enum(["todo", "doing", "done"]).optional(),
  bugSeverity: z.enum(["blocker", "critical", "major", "minor"]).optional(),
  titleTemplate: optionalText,
  bodyTemplate: optionalText,
});

function mapError(error: unknown): AutomationActionState {
  if (error instanceof ForbiddenError) {
    return { ok: false, error: "只有项目管理员和学生可以修改自动化规则" };
  }
  if (error instanceof AppError) return { ok: false, error: error.message };
  throw error;
}

function revalidateAutomation(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/automations`);
}

export async function createAutomationAction(
  _prev: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse({
    ...raw,
    description: raw.description || undefined,
    eventType: raw.eventType || undefined,
    eventStatus: raw.eventStatus || undefined,
    conditionFromStatus: raw.conditionFromStatus || undefined,
    conditionToStatus: raw.conditionToStatus || undefined,
    conditionWorkItemType: raw.conditionWorkItemType || undefined,
    conditionPriority: raw.conditionPriority || undefined,
    conditionReleaseStatus: raw.conditionReleaseStatus || undefined,
    recipient: raw.recipient || undefined,
    actionTaskStatus: raw.actionTaskStatus || undefined,
    bugSeverity: raw.bugSeverity || undefined,
    titleTemplate: raw.titleTemplate || undefined,
    bodyTemplate: raw.bodyTemplate || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;
  if (data.triggerType === "external_event" && !data.eventType) {
    return { ok: false, error: "外部事件规则至少需要指定事件类型" };
  }
  if (data.actionType === "set_task_status" && !data.actionTaskStatus) {
    return { ok: false, error: "请选择要推进到的任务状态" };
  }

  const conditions: AutomationConditions = {
    ...(data.eventType && { eventType: data.eventType }),
    ...(data.eventStatus && { eventStatus: data.eventStatus }),
    ...(data.conditionFromStatus && {
      fromStatus: data.conditionFromStatus,
    }),
    ...(data.conditionToStatus && { toStatus: data.conditionToStatus }),
    ...(data.conditionWorkItemType && {
      workItemType: data.conditionWorkItemType,
    }),
    ...(data.conditionPriority && { priority: data.conditionPriority }),
    ...(data.conditionReleaseStatus && {
      releaseStatus: data.conditionReleaseStatus,
    }),
  };
  const actionConfig: AutomationActionConfig = {
    ...(data.actionType === "notify" && {
      recipient: data.recipient ?? "admins",
    }),
    ...(data.actionType === "set_task_status" && {
      status: data.actionTaskStatus,
    }),
    ...(data.actionType === "create_bug" && {
      bugSeverity: data.bugSeverity ?? "major",
    }),
    ...(data.titleTemplate && { title: data.titleTemplate }),
    ...(data.bodyTemplate && { body: data.bodyTemplate }),
  };
  try {
    await createAutomationRule(session.user.id, data.projectId, {
      name: data.name,
      description: data.description,
      triggerType: data.triggerType,
      conditions,
      actionType: data.actionType,
      actionConfig,
    });
    revalidateAutomation(data.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function createAutomationTemplateAction(input: {
  projectId: string;
  templateId: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = z
    .object({ projectId: z.uuid(), templateId: z.string() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "参数无效" };
  const template = AUTOMATION_TEMPLATES.find(
    (item) => item.id === parsed.data.templateId,
  );
  if (!template) return { ok: false as const, error: "模板不存在" };
  try {
    await createAutomationRule(session.user.id, parsed.data.projectId, template);
    revalidateAutomation(parsed.data.projectId);
    return { ok: true as const };
  } catch (error) {
    return mapError(error);
  }
}

export async function toggleAutomationAction(input: {
  projectId: string;
  ruleId: string;
  enabled: boolean;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = z
    .object({
      projectId: z.uuid(),
      ruleId: z.uuid(),
      enabled: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "参数无效" };
  try {
    await setAutomationRuleEnabled(
      session.user.id,
      parsed.data.ruleId,
      parsed.data.enabled,
    );
    revalidateAutomation(parsed.data.projectId);
    return { ok: true as const };
  } catch (error) {
    return mapError(error);
  }
}

export async function deleteAutomationAction(input: {
  projectId: string;
  ruleId: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = z
    .object({ projectId: z.uuid(), ruleId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "参数无效" };
  try {
    await deleteAutomationRule(session.user.id, parsed.data.ruleId);
    revalidateAutomation(parsed.data.projectId);
    return { ok: true as const };
  } catch (error) {
    return mapError(error);
  }
}
