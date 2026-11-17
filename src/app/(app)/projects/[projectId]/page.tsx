import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { conversations, messages as messagesTable } from "@/db/schema";
import { getProjectForUser, listProjectMilestones } from "@/lib/project";
import { listTeamMembers } from "@/lib/team";
import { listProjectTasks, listProjectDependencies } from "@/lib/task";
import { listProjectSprints } from "@/lib/sprint";
import { listTeamLabels } from "@/lib/label";
import { listProjectReleases } from "@/lib/planning";
import {
  parseFilters,
  applyFilters,
  applySprintFilter,
  resolveSprintFilter,
} from "@/lib/board-filters";
import { MilestoneSection } from "./milestone-section";
import { Board } from "./board";
import { ChatPanel } from "./chat-panel";
import { FilterBar } from "./filter-bar";
import { ProjectFilesLibrary } from "@/components/project-files/project-files-library";
import { listProjectFiles } from "@/lib/project-file-service";
import { listProjectComments } from "@/lib/project-comment";
import { ProjectComments } from "./comments/project-comments";
import { getAiSettingsView } from "@/lib/agent/ai-settings";
import { getProjectWorkflow } from "@/lib/workflow";
import { listSavedTaskViews } from "@/lib/views";
import { recordRecentVisit } from "@/lib/recent-visits";

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

  const [projectMilestones, projectSprints, projectTasks, members, dependencies, teamLabels, projectFiles, commentsPage, aiSettings, workflow, projectReleases, savedViews] = await Promise.all([
    listProjectMilestones(session.user.id, projectId),
    listProjectSprints(session.user.id, projectId),
    listProjectTasks(session.user.id, projectId),
    listTeamMembers(project.teamId),
    listProjectDependencies(session.user.id, projectId),
    listTeamLabels(session.user.id, project.teamId),
    listProjectFiles(session.user.id, projectId),
    listProjectComments(session.user.id, projectId, { limit: 20 }),
    getAiSettingsView(session.user.id),
    getProjectWorkflow(session.user.id, projectId),
    listProjectReleases(session.user.id, projectId),
    listSavedTaskViews(session.user.id, projectId),
  ]);

  const focusTaskId = typeof sp.task === "string" ? sp.task : null;
  const focusTask = focusTaskId
    ? projectTasks.find((task) => task.id === focusTaskId) ?? null
    : null;
  await recordRecentVisit(session.user.id, {
    projectId,
    taskId: focusTask?.id ?? null,
    label: focusTask
      ? `任务 #${focusTask.taskNumber ?? focusTask.id.slice(0, 8)} · ${focusTask.title}`
      : project.name,
    path: focusTask
      ? `/projects/${projectId}?task=${focusTask.id}&sprint=all`
      : `/projects/${projectId}`,
  });

  const filters = parseFilters(
    new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v] as [string, string]] : [],
      ),
    ),
  );
  // 「今日」在服务端按本地时区取 YYYY-MM-DD，随后仅作字符串比较
  const today = new Date().toLocaleDateString("sv-SE");
  const activeSprint =
    projectSprints.find((sprint) => sprint.status === "active") ?? null;
  const resolvedSprint = resolveSprintFilter(
    filters.sprint,
    activeSprint?.id ?? null,
  );
  const sprintScopedTasks = applySprintFilter(projectTasks, resolvedSprint);
  const visibleTasks = applyFilters(sprintScopedTasks, filters, today);
  const taskCreateSprintId = projectSprints.some(
    (sprint) => sprint.id === resolvedSprint && sprint.status !== "closed",
  )
    ? resolvedSprint
    : null;

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
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          项目看板
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{project.name}</h1>
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
          projectId={projectId}
          currentUserId={session.user.id}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          milestones={projectMilestones.map((m) => ({ id: m.id, name: m.title }))}
          labels={teamLabels.map((l) => ({ id: l.id, name: l.name }))}
          sprints={projectSprints.map((sprint) => ({ id: sprint.id, name: sprint.name }))}
          visible={visibleTasks.length}
          total={sprintScopedTasks.length}
          savedViews={savedViews.map((view) => ({
            id: view.id,
            name: view.name,
            filters: view.filters,
          }))}
        />
        <Board
          projectId={projectId}
          groupBy={filters.group}
          tasks={visibleTasks.map((t) => ({
            id: t.id,
            taskNumber: t.taskNumber,
            title: t.title,
            description: t.description,
            completionNote: t.completionNote,
            status: t.status,
            statusId: t.statusId,
            priority: t.priority,
            workItemType: t.workItemType,
            bugSeverity: t.bugSeverity,
            parentWorkItemId: t.parentWorkItemId,
            startDate: t.startDate,
            dueDate: t.dueDate,
            estimate: t.estimate,
            estimatedHours: t.estimatedHours,
            actualHours: t.actualHours,
            sprintId: t.sprintId,
            releaseId: t.releaseId,
            assigneeName: t.assigneeName,
            assigneeId: t.assigneeId,
            assigneeIds: t.assigneeIds,
            assignees: t.assignees,
            attachments: t.attachments,
            milestoneId: t.milestoneId,
            labels: t.labels,
            commentCount: t.commentCount,
            mentioned: t.mentioned,
          }))}
          canWrite={canWrite}
          canEdit={canWrite}
          currentUserId={session.user.id}
          isAdmin={isAdmin}
          members={members}
          milestones={projectMilestones.map((m) => ({ id: m.id, name: m.title }))}
          allTasks={projectTasks.map((t) => ({
            id: t.id,
            title: t.title,
            workItemType: t.workItemType,
          }))}
          allLabels={teamLabels.map((l) => ({ id: l.id, name: l.name }))}
          dependencies={dependencies}
          sprints={projectSprints.map((sprint) => ({
            id: sprint.id,
            name: sprint.name,
            status: sprint.status,
          }))}
          releases={projectReleases.map((release) => ({
            id: release.id,
            name: release.name,
            status: release.status,
          }))}
          workflowStatuses={workflow.statuses.map((status) => ({
            id: status.id,
            name: status.name,
            category: status.category,
            color: status.color,
            position: status.position,
            wipLimit: status.wipLimit,
            taskCount: status.taskCount,
          }))}
          transitions={workflow.transitions}
          defaultSprintId={taskCreateSprintId}
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
