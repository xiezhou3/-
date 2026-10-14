"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  connectGithubRepository,
  disconnectGithubRepository,
  syncGithubRepository,
} from "@/lib/project-repository-service";

export type GithubActionState = { error: string } | { ok: true } | null;

const projectSchema = z.object({
  projectId: z.uuid(),
  repositoryUrl: z.string().trim().min(1, "请输入 GitHub 仓库地址"),
});

export async function connectGithubRepositoryAction(
  _prev: GithubActionState,
  formData: FormData,
): Promise<GithubActionState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectGithubRepository(
      session.user.id,
      parsed.data.projectId,
      parsed.data.repositoryUrl,
    );
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

const projectOnlySchema = z.object({ projectId: z.uuid() });

export async function syncGithubRepositoryAction(
  _prev: GithubActionState,
  formData: FormData,
): Promise<GithubActionState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = projectOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "参数无效" };

  try {
    await syncGithubRepository(session.user.id, parsed.data.projectId);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function disconnectGithubRepositoryAction(
  _prev: GithubActionState,
  formData: FormData,
): Promise<GithubActionState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  const parsed = projectOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "参数无效" };

  try {
    await disconnectGithubRepository(session.user.id, parsed.data.projectId);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}
