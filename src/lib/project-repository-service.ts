import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projectRepositories } from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import {
  fetchGitHubRepository,
  parseGitHubRepositoryUrl,
  type GithubRepositorySnapshot,
} from "./github-repository";
import { getProjectForUser } from "./project";

export type ProjectRepository = {
  id: string;
  provider: "github";
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  defaultBranch: string;
  visibility: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  latestCommitSha: string | null;
  latestCommitMessage: string | null;
  latestCommitUrl: string | null;
  lastSyncedAt: string;
  canManage: boolean;
};

export async function getProjectRepository(
  actorId: string,
  projectId: string,
): Promise<ProjectRepository | null> {
  const access = await requireProjectMembership(actorId, projectId);
  const [repository] = await db
    .select()
    .from(projectRepositories)
    .where(eq(projectRepositories.projectId, projectId));
  return repository ? mapRepository(repository, access.role === "admin") : null;
}

export async function connectGithubRepository(
  actorId: string,
  projectId: string,
  repositoryUrl: string,
): Promise<ProjectRepository> {
  const access = await requireProjectMembership(actorId, projectId);
  if (access.role !== "admin") {
    throw new ForbiddenError("仅团队管理员可以连接 GitHub 仓库");
  }

  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  const snapshot = await fetchGitHubRepository(parsed.owner, parsed.name);
  const values = repositorySnapshotValues(snapshot);
  const [repository] = await db
    .insert(projectRepositories)
    .values({
      projectId,
      createdById: actorId,
      ...values,
    })
    .onConflictDoUpdate({
      target: projectRepositories.projectId,
      set: values,
    })
    .returning();

  return mapRepository(repository, true);
}

export async function syncGithubRepository(
  actorId: string,
  projectId: string,
): Promise<ProjectRepository> {
  const access = await requireProjectMembership(actorId, projectId);
  if (access.role !== "admin") {
    throw new ForbiddenError("仅团队管理员可以同步 GitHub 仓库");
  }

  const [existing] = await db
    .select()
    .from(projectRepositories)
    .where(eq(projectRepositories.projectId, projectId));
  if (!existing) throw new AppError("尚未连接 GitHub 仓库");

  const snapshot = await fetchGitHubRepository(existing.owner, existing.name);
  const [repository] = await db
    .update(projectRepositories)
    .set(repositorySnapshotValues(snapshot))
    .where(eq(projectRepositories.projectId, projectId))
    .returning();
  return mapRepository(repository, true);
}

export async function disconnectGithubRepository(
  actorId: string,
  projectId: string,
) {
  const access = await requireProjectMembership(actorId, projectId);
  if (access.role !== "admin") {
    throw new ForbiddenError("仅团队管理员可以断开 GitHub 仓库");
  }
  await db
    .delete(projectRepositories)
    .where(eq(projectRepositories.projectId, projectId));
}

async function requireProjectMembership(actorId: string, projectId: string) {
  const access = await getProjectForUser(actorId, projectId);
  if (!access) throw new ForbiddenError();
  return access;
}

function repositorySnapshotValues(snapshot: GithubRepositorySnapshot) {
  return {
    provider: "github" as const,
    owner: snapshot.owner,
    name: snapshot.name,
    fullName: snapshot.fullName,
    htmlUrl: snapshot.htmlUrl,
    description: snapshot.description,
    defaultBranch: snapshot.defaultBranch,
    visibility: snapshot.visibility,
    language: snapshot.language,
    stars: snapshot.stars,
    forks: snapshot.forks,
    openIssues: snapshot.openIssues,
    latestCommitSha: snapshot.latestCommitSha,
    latestCommitMessage: snapshot.latestCommitMessage,
    latestCommitUrl: snapshot.latestCommitUrl,
    lastSyncedAt: snapshot.fetchedAt,
    updatedAt: snapshot.fetchedAt,
  };
}

function mapRepository(
  repository: typeof projectRepositories.$inferSelect,
  canManage: boolean,
): ProjectRepository {
  return {
    id: repository.id,
    provider: "github",
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    htmlUrl: repository.htmlUrl,
    description: repository.description,
    defaultBranch: repository.defaultBranch,
    visibility: repository.visibility,
    language: repository.language,
    stars: repository.stars,
    forks: repository.forks,
    openIssues: repository.openIssues,
    latestCommitSha: repository.latestCommitSha,
    latestCommitMessage: repository.latestCommitMessage,
    latestCommitUrl: repository.latestCommitUrl,
    lastSyncedAt: repository.lastSyncedAt.toISOString(),
    canManage,
  };
}
