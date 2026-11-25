import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { FolderOpen, GitBranch, PlugZap } from "lucide-react";
import { z } from "zod";
import { db } from "@/db";
import { projectIntegrations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/project";
import { getProjectRepository } from "@/lib/project-repository-service";
import { GithubRepositoryPanel } from "../github-repository-panel";

export default async function ProjectRepositoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();

  const access = await getProjectForUser(session.user.id, projectId);
  if (!access) notFound();

  const [repository, githubIntegrationRows] = await Promise.all([
    getProjectRepository(session.user.id, projectId),
    db
      .select({ repositoryUrl: projectIntegrations.repositoryUrl })
      .from(projectIntegrations)
      .where(
        and(
          eq(projectIntegrations.projectId, projectId),
          eq(projectIntegrations.provider, "github"),
        ),
      )
      .limit(1),
  ]);
  const defaultRepositoryUrl =
    githubIntegrationRows[0]?.repositoryUrl ?? "";

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">{access.project.name}</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-ink">
            <GitBranch className="h-5 w-5 text-primary" aria-hidden />
            代码仓库
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            连接 GitHub 仓库，浏览分支文件、下载源码、提取到项目资料，或直接提交文件。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/projects/${projectId}/files`}
            className="ac-btn-ghost"
          >
            <FolderOpen className="h-4 w-4" aria-hidden />
            项目文件
          </Link>
          <Link
            href={`/projects/${projectId}/integrations`}
            className="ac-btn-ghost"
          >
            <PlugZap className="h-4 w-4" aria-hidden />
            集成中心
          </Link>
        </div>
      </header>

      <GithubRepositoryPanel
        key={repository?.lastSyncedAt ?? "empty"}
        projectId={projectId}
        repository={repository}
        canManage={access.role === "admin"}
        defaultRepositoryUrl={defaultRepositoryUrl}
      />
    </main>
  );
}
