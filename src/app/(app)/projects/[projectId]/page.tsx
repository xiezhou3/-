import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { CalendarRange, FolderKanban } from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { conversations, messages as messagesTable } from "@/db/schema";
import { getProjectForUser, listProjectMilestones } from "@/lib/project";
import { listTeamMembers } from "@/lib/team";
import { listProjectTasks, listProjectDependencies } from "@/lib/task";
import { listTeamLabels } from "@/lib/label";
import { parseFilters, applyFilters } from "@/lib/board-filters";
import { MilestoneSection } from "./milestone-section";
import { Board } from "./board";
import { ChatPanel } from "./chat-panel";
import { FilterBar } from "./filter-bar";
import { ProjectFilesLibrary } from "@/components/project-files/project-files-library";
import { listProjectFiles } from "@/lib/project-file-service";
import { listProjectComments } from "@/lib/project-comment";
import { ProjectComments } from "./comments/project-comments";
import { GithubRepositoryPanel } from "./github-repository-panel";
import { getProjectRepository } from "@/lib/project-repository-service";
import { getAiSettingsView } from "@/lib/agent/ai-settings";

const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: "进行中",
  archived: "已归档",
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();

  const access = await getProjectForUser(session.user.id, projectId);
  if (!access) notFound();
  const { project, role } = access;

  const [projectMilestones, projectTasks, members, dependencies, teamLabels, projectFiles, commentsPage, repository, aiSettings] = await Promise.all([
    listProjectMilestones(session.user.id, projectId),
    listProjectTasks(session.user.id, projectId),
    listTeamMembers(project.teamId),
    listProjectDependencies(session.user.id, projectId),
    listTeamLabels(session.user.id, project.teamId),
    listProjectFiles(session.user.id, projectId),
    listProjectComments(session.user.id, projectId, { limit: 20 }),
    getProjectRepository(session.user.id, projectId),
    getAiSettingsView(session.user.id),
  ]);

  const filters = parseFilters(
    new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v] as [string, string]] : [],
      ),
    ),
  );
  // 「今日」在服务端按本地时区取 YYYY-MM-DD，随后仅作字符串比较
  const today = new Date().toLocaleDateString("sv-SE");
  const visibleTasks = applyFilters(projectTasks, filters, today);

  const canWrite = role === "admin" || role === "student";
  const isAdmin = role === "admin";

  const [latestConv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  const history = latestConv
    ? await db
        .select({ role: messagesTable.role, content: messagesTable.content })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, latestConv.id))
        .orderBy(messagesTable.createdAt)
    : [];

  const initialMessages = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return (
    <main className="mx-auto w-full max-w-[92rem] space-y-6 py-2 sm:space-y-8 sm:py-4">
      <header className="border-b border-line pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
            >
              <FolderKanban className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                {project.name}
              </h1>
              {project.description && (
                <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
                  {project.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <Link href={`/projects/${projectId}/files`} className="ac-btn-ghost whitespace-nowrap">
              文件
            </Link>
            <a
              href={`/projects/${projectId}/timeline`}
              className="ac-btn-ghost whitespace-nowrap"
            >
              时间线
            </a>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
            {project.startDate ?? "未设置"} 至 {project.endDate ?? "未设置"}
          </span>
          <span className="ac-badge bg-surface text-ink-soft">
            {PROJECT_STATUS_LABEL[project.status] ?? project.status}
          </span>
        </div>
      </header>

      <GithubRepositoryPanel
        key={`github-${projectId}-${repository?.lastSyncedAt ?? "empty"}`}
        projectId={projectId}
        repository={repository}
        canManage={isAdmin}
      />

      <MilestoneSection
        projectId={projectId}
        milestones={projectMilestones}
        isAdmin={isAdmin}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">看板</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              当前展示 {visibleTasks.length} / {projectTasks.length} 个任务
            </p>
          </div>
          {visibleTasks.length !== projectTasks.length && (
            <span className="ac-badge bg-accent-soft text-accent">已筛选</span>
          )}
        </div>
        <FilterBar
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          milestones={projectMilestones.map((m) => ({ id: m.id, name: m.title }))}
          labels={teamLabels.map((l) => ({ id: l.id, name: l.name }))}
          visible={visibleTasks.length}
          total={projectTasks.length}
        />
        <Board
          projectId={projectId}
          groupBy={filters.group}
          tasks={visibleTasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            completionNote: t.completionNote,
            status: t.status,
            priority: t.priority,
            startDate: t.startDate,
            dueDate: t.dueDate,
            assigneeName: t.assigneeName,
            assigneeId: t.assigneeId,
            milestoneId: t.milestoneId,
            labels: t.labels,
          }))}
          canWrite={canWrite}
          members={members}
          milestones={projectMilestones.map((m) => ({ id: m.id, name: m.title }))}
          allTasks={projectTasks.map((t) => ({ id: t.id, title: t.title }))}
          allLabels={teamLabels.map((l) => ({ id: l.id, name: l.name }))}
          dependencies={dependencies}
        />
      </section>

      <ProjectFilesLibrary
        key={`files-${projectId}`}
        projectId={projectId}
        projectName={project.name}
        files={projectFiles}
        variant="compact"
        viewAllHref={`/projects/${projectId}/files`}
      />

      <ChatPanel
        projectId={projectId}
        initialMessages={initialMessages}
        members={members}
        milestones={projectMilestones.map((m) => ({ id: m.id, name: m.title }))}
        aiSettings={aiSettings}
      />

      <ProjectComments
        key={`comments-${projectId}`}
        projectId={projectId}
        initialThreads={commentsPage.threads}
        initialTotalCount={commentsPage.totalCount}
        initialHasMore={commentsPage.hasMore}
        initialCursor={commentsPage.nextCursor}
      />
    </main>
  );
}
