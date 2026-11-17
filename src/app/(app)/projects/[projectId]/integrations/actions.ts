"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError, ForbiddenError } from "@/lib/errors";
import {
  rotateIntegrationKey,
  sendTestIntegrationEvent,
  upsertProjectIntegration,
} from "@/lib/integrations";

export type IntegrationActionState =
  | { ok: true }
  | { ok: false; error: string }
  | null;

const saveSchema = z.object({
  projectId: z.uuid(),
  provider: z.enum(["github", "gitlab", "ci", "webhook"]),
  name: z.string().trim().max(120).optional(),
  repositoryUrl: z.string().trim().max(1000).optional(),
  status: z.enum(["active", "paused"]),
});

function mapError(error: unknown): IntegrationActionState {
  if (error instanceof ForbiddenError) {
    return { ok: false, error: "只有项目管理员和学生可以修改集成" };
  }
  if (error instanceof AppError) return { ok: false, error: error.message };
  throw error;
}

function revalidateIntegration(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/integrations`);
  revalidatePath(`/projects/${projectId}/planning`);
}

export async function saveIntegrationAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "请先登录" };
  const raw = Object.fromEntries(formData);
  const parsed = saveSchema.safeParse({
    ...raw,
    name: raw.name || undefined,
    repositoryUrl: raw.repositoryUrl || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { projectId, provider, ...input } = parsed.data;
  try {
    await upsertProjectIntegration(
      session.user.id,
      projectId,
      provider,
      input,
    );
    revalidateIntegration(projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function rotateIntegrationKeyAction(input: {
  projectId: string;
  integrationId: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = z
    .object({ projectId: z.uuid(), integrationId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "参数无效" };
  try {
    const integration = await rotateIntegrationKey(
      session.user.id,
      parsed.data.integrationId,
    );
    revalidateIntegration(parsed.data.projectId);
    return { ok: true as const, webhookKey: integration.webhookKey };
  } catch (error) {
    return mapError(error);
  }
}

export async function sendTestIntegrationEventAction(input: {
  projectId: string;
  integrationId: string;
}) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "请先登录" };
  const parsed = z
    .object({ projectId: z.uuid(), integrationId: z.uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "参数无效" };
  try {
    await sendTestIntegrationEvent(session.user.id, parsed.data.integrationId);
    revalidateIntegration(parsed.data.projectId);
    return { ok: true as const };
  } catch (error) {
    return mapError(error);
  }
}
