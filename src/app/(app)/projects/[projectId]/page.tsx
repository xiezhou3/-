import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  FolderKanban,
  FolderOpen,
  GitBranch,
  ListChecks,
} from "lucide-react";
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
import { getProjectRepository } from "@/lib/project-repository-service";
import { PageHeader } from "@/components/layout/page-header";
import { GithubRepositoryPanel } from "./github-repository-panel";
import { ProjectWorkspaceTabs } from "./workspace-tabs";

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

  const [projectMilestones, projectSprints, projectTasks, members, dependencies, teamLabels, projectFiles, commentsPage, aiSettings, workflow, projectReleases, savedViews, repository] = await Promise.all([
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
    getProjectRepository(session.user.id, projectId),
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

  const completedTasks = projectTasks.filter((task) => task.status === "done").length;
  const doingTasks = projectTasks.filter((task) => task.status === "doing").length;
  const overdueTasks = projectTasks.filter(
    (task) =>
      task.status !== "done" && task.dueDate !== null && task.dueDate < today,
  ).length;
  const completionRate =
    projectTasks.length > 0
      ? Math.round((completedTasks / projectTasks.length) * 100)
      : 0;
  const activeSprintName = activeSprint?.name ?? "未启动迭代";

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="项目空间"
        breadcrumbs={[
          { label: "工作台", href: "/workbench" },
          { label: "项目", href: "/projects" },
          { label: project.name },
        ]}
        icon={
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary ring-1 ring-primary-ring/60"
          >
            <FolderKanban className="h-5 w-5" />
          </span>
        }
        title={project.name}
        description={project.description}
        meta={
          <>
            <span className="inline-flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
              {project.startDate ?? "未设置"} 至 {project.endDate ?? "未设置"}
            </span>
            <span
              className={`ac-badge ${
                project.status === "active"
                  ? "bg-done/12 text-done"
                  : "bg-sunken text-ink-soft"
              }`}
            >
              {PROJECT_STATUS_LABEL[project.status] ?? project.status}
            </span>
            <span className="text-ink-faint">
              当前迭代：{activeSprintName}
            </span>
          </>
        }
        actions={
          <>
            <Link href={`/projects/${projectId}/timeline`} className="ac-btn-ghost">
              <CalendarRange className="h-4 w-4" aria-hidden />
              时间线
            </Link>
            <Link href={`/projects/${projectId}/files`} className="ac-btn-ghost">
              <FolderOpen className="h-4 w-4" aria-hidden />
              资料库
            </Link>
            <Link href={`/projects/${projectId}/repository`} className="ac-btn">
              <GitBranch className="h-4 w-4" aria-hidden />
              代码仓库
            </Link>
          </>
        }
      />

      <section
        aria-label="项目概况"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <ProjectMetric
          icon={ListChecks}
          label="任务进度"
          value={`${completedTasks}/${projectTasks.length}`}
          hint={`${completionRate}% 已完成`}
          accent="primary"
        />
        <ProjectMetric
          icon={Clock3}
          label="正在进行"
          value={String(doingTasks)}
          hint={`${overdueTasks} 项已逾期`}
          accent={overdueTasks > 0 ? "danger" : "done"}
        />
        <ProjectMetric
          icon={CheckCircle2}
          label="里程碑"
          value={String(projectMilestones.length)}
          hint={`${projectReleases.length} 个发布版本`}
          accent="accent"
        />
        <ProjectMetric
          icon={FolderOpen}
          label="项目资料"
          value={String(projectFiles.length)}
          hint={repository ? "GitHub 仓库已连接" : "尚未连接代码仓库"}
          accent="neutral"
        />
      </section>

      <ProjectWorkspaceTabs
        boardCount={projectTasks.length}
        fileCount={projectFiles.length}
        discussionCount={commentsPage.totalCount}
        assistant={
          <ChatPanel
            projectId={projectId}
            initialMessages={initialMessages}
            members={members}
            milestones={projectMilestones.map((m) => ({ id: m.id, name: m.title }))}
            aiSettings={aiSettings}
          />
        }
        board={
          <div className="space-y-4">
            <MilestoneSection
              projectId={projectId}
              milestones={projectMilestones}
              isAdmin={isAdmin}
            />
            <section className="ac-panel space-y-3 p-3 sm:p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    任务看板
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    当前展示 {visibleTasks.length} / {sprintScopedTasks.length} 个任务
                  </p>
                </div>
                {visibleTasks.length !== sprintScopedTasks.length ? (
                  <span className="ac-badge bg-accent-soft text-accent">已筛选</span>
                ) : null}
              </div>
              <FilterBar
                projectId={projectId}
                currentUserId={session.user.id}
                members={members.map((m) => ({ id: m.id, name: m.name }))}
                milestones={projectMilestones.map((m) => ({
                  id: m.id,
                  name: m.title,
                }))}
                labels={teamLabels.map((l) => ({ id: l.id, name: l.name }))}
                sprints={projectSprints.map((sprint) => ({
                  id: sprint.id,
                  name: sprint.name,
                }))}
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
                milestones={projectMilestones.map((m) => ({
                  id: m.id,
                  name: m.title,
                }))}
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
          </div>
        }
        files={
          <div className="space-y-4">
            <GithubRepositoryPanel
              key={`github-${projectId}-${repository?.lastSyncedAt ?? "empty"}`}
              projectId={projectId}
              repository={repository}
              canManage={isAdmin}
            />
            <ProjectFilesLibrary
              key={`files-${projectId}`}
              projectId={projectId}
              projectName={project.name}
              files={projectFiles}
              variant="full"
            />
          </div>
        }
        discussion={
          <ProjectComments
            key={`comments-${projectId}`}
            projectId={projectId}
            initialThreads={commentsPage.threads}
            initialTotalCount={commentsPage.totalCount}
            initialHasMore={commentsPage.hasMore}
            initialCursor={commentsPage.nextCursor}
          />
        }
      />
    </main>
  );
}

function ProjectMetric({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof ListChecks;
  label: string;
  value: string;
  hint: string;
  accent: "primary" | "accent" | "danger" | "done" | "neutral";
}) {
  const tone = {
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent",
    danger: "bg-high-soft text-high",
    done: "bg-done/12 text-done",
    neutral: "bg-sunken text-ink-soft",
  }[accent];

  return (
    <div className="ac-card flex min-w-0 items-center gap-3 p-4">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-field ${tone}`}>
        <Icon className="h-4.5 w-4.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-ink-faint">{label}</p>
        <p className="font-display text-xl font-semibold leading-tight tabular-nums text-ink">
          {value}
        </p>
        <p className="truncate text-[11px] text-ink-faint">{hint}</p>
      </div>
    </div>
  );
}
