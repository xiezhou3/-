"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  createWorkflowStatus,
  deleteWorkflowStatus,
  reorderWorkflowStatuses,
  setWorkflowTransitions,
  updateWorkflowStatus,
} from "@/lib/workflow";

export type WorkflowActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

const categorySchema = z.enum(["todo", "doing", "done"]);
const colorSchema = z.enum([
  "slate",
  "blue",
  "amber",
  "green",
  "red",
  "violet",
  "pink",
]);

const createSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "请填写状态名称").max(40, "状态名称最多 40 字"),
  category: categorySchema,
  color: colorSchema,
  wipLimit: z.coerce.number().int().min(1).optional(),
});

const updateSchema = createSchema.extend({
  statusId: z.uuid(),
});

function revalidateWorkflow(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/workflow`);
  revalidatePath(`/projects/${projectId}/backlog`);
  revalidatePath(`/projects/${projectId}/sprints`);
}

function mapError(error: unknown) {
  if (error instanceof AppError) return { ok: false as const, error: error.message };
  throw error;
}

export async function createWorkflowStatusAction(
  _prev: WorkflowActionState,
  formData: FormData,
): Promise<WorkflowActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const raw = Object.fromEntries(formData);
  const parsed = createSchema.safeParse({
    ...raw,
    wipLimit: raw.wipLimit || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { projectId, ...input } = parsed.data;
  try {
    await createWorkflowStatus(session.user.id, projectId, input);
    revalidateWorkflow(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "仅项目管理员可配置工作流" };
    }
    return mapError(error);
  }
}

export async function updateWorkflowStatusAction(
  _prev: WorkflowActionState,
  formData: FormData,
): Promise<WorkflowActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const raw = Object.fromEntries(formData);
  const parsed = updateSchema.safeParse({
    ...raw,
    wipLimit: raw.wipLimit || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { projectId, statusId, ...patch } = parsed.data;
  try {
    await updateWorkflowStatus(session.user.id, statusId, patch);
    revalidateWorkflow(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "仅项目管理员可配置工作流" };
    }
    return mapError(error);
  }
}

const projectStatusSchema = z.object({
  projectId: z.uuid(),
  statusId: z.uuid(),
});

export async function deleteWorkflowStatusAction(input: {
  projectId: string;
  statusId: string;
}): Promise<WorkflowActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = projectStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "参数无效" };
  try {
    await deleteWorkflowStatus(session.user.id, parsed.data.statusId);
    revalidateWorkflow(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "仅项目管理员可配置工作流" };
    }
    return mapError(error);
  }
}

const reorderSchema = z.object({
  projectId: z.uuid(),
  orderedIds: z.array(z.uuid()),
});

export async function reorderWorkflowStatusesAction(input: {
  projectId: string;
  orderedIds: string[];
}): Promise<WorkflowActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "排序参数无效" };
  try {
    await reorderWorkflowStatuses(
      session.user.id,
      parsed.data.projectId,
      parsed.data.orderedIds,
    );
    revalidateWorkflow(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "仅项目管理员可配置工作流" };
    }
    return mapError(error);
  }
}

const transitionsSchema = z.object({
  projectId: z.uuid(),
  pairs: z.array(
    z.object({ fromStatusId: z.uuid(), toStatusId: z.uuid() }),
  ),
});

export async function saveWorkflowTransitionsAction(input: {
  projectId: string;
  pairs: Array<{ fromStatusId: string; toStatusId: string }>;
}): Promise<WorkflowActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const parsed = transitionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "流转规则参数无效" };
  try {
    await setWorkflowTransitions(
      session.user.id,
      parsed.data.projectId,
      parsed.data.pairs,
    );
    revalidateWorkflow(parsed.data.projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "仅项目管理员可配置工作流" };
    }
    return mapError(error);
  }
}
