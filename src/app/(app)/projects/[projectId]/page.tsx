import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
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

  const [projectMilestones, projectTasks, members, dependencies, teamLabels, projectFiles, commentsPage] = await Promise.all([
    listProjectMilestones(session.user.id, projectId),
    listProjectTasks(session.user.id, projectId),
    listTeamMembers(project.teamId),
    listProjectDependencies(session.user.id, projectId),
    listTeamLabels(session.user.id, project.teamId),
    listProjectFiles(session.user.id, projectId),
    listProjectComments(session.user.id, projectId, { limit: 20 }),
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
    <main className="mx-auto max-w-5xl space-y-8 py-8">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-ink">{project.name}</h1>
          <div className="flex shrink-0 gap-2">
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
        {project.description && (
          <p className="mt-1 text-sm text-ink-soft">{project.description}</p>
        )}
        <p className="mt-1 text-xs text-ink-faint">
          {project.startDate ?? "?"} ~ {project.endDate ?? "?"} · {project.status}
        </p>
      </header>

      <MilestoneSection
        projectId={projectId}
        milestones={projectMilestones}
        isAdmin={isAdmin}
      />

      <section className="space-y-3">
        <h2 className="font-medium text-ink">看板</h2>
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
            assigneeIds: t.assigneeIds,
            assignees: t.assignees,
            milestoneId: t.milestoneId,
            labels: t.labels,
          }))}
          canWrite={canWrite}
          canEdit={isAdmin}
          currentUserId={session.user.id}
          isAdmin={isAdmin}
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
