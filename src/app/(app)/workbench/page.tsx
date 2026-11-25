import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FolderKanban,
  Inbox,
  ListChecks,
  MessageSquare,
  RefreshCw,
  Sun,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/lib/auth";
import type { PendingTaskReview } from "@/lib/task-review";
import type { RecentVisit } from "@/lib/recent-visits";
import {
  getMyWorkbench,
  resolveWorkbenchView,
  type SubmittedWorkbenchReview,
  type WorkbenchNotification,
  type WorkbenchProjectLoad,
  type WorkbenchTask,
  type WorkbenchView,
  type MyWorkbench,
} from "@/lib/workbench";
import {
  WORK_ITEM_TYPE_BADGE,
  WORK_ITEM_TYPE_LABEL,
} from "@/lib/work-item";
import { PageHeader } from "@/components/layout/page-header";

const ROLE_LABEL = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
} as const;

const PRIORITY_LABEL = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
} as const;

const PRIORITY_TONE = {
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
} as const;

const STATUS_FALLBACK = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
} as const;

const STATUS_TONE = {
  slate: "bg-sunken text-ink-soft",
  blue: "bg-primary-soft text-primary",
  amber: "bg-medium-soft text-medium",
  green: "bg-done/12 text-done",
  red: "bg-high-soft text-high",
  violet: "bg-violet-50 text-violet-700",
  pink: "bg-pink-50 text-pink-700",
} as const;

const TAB_LABEL: Record<WorkbenchView, string> = {
  mine: "我的任务",
  today: "今日待办",
  overdue: "逾期任务",
  review: "待审核",
  personal: "个人视图",
};

export default async function WorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const view = resolveWorkbenchView(params.view);
  const data = await getMyWorkbench(session.user.id);
  const doingCount = data.tasks.filter((task) => task.status === "doing").length;
  const queueIds = new Set(data.reviewQueue.map((review) => review.id));
  const submittedOnly = data.submittedReviews.filter(
    (review) => !queueIds.has(review.id),
  );

  const tabs: Array<{
    view: WorkbenchView;
    count?: number;
  }> = [
    { view: "mine", count: data.summary.assignedOpen },
    { view: "today", count: data.summary.today },
    { view: "overdue", count: data.summary.overdue },
    { view: "review", count: data.summary.reviewAttention },
    { view: "personal" },
  ];

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="今日工作台"
        title={`${greeting()}，${session.user.name}`}
        description="先处理临近截止和待审核的事项，再从项目看板推进今天的重点。"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
              {formatDateKey(data.today)}
            </span>
            <span className="text-ink-faint">
              已完成节奏：近 7 天 {data.summary.completedLast7Days} 项
            </span>
          </>
        }
        actions={
          <>
            <Link href="/projects" className="ac-btn-ghost">
              <FolderKanban className="h-4 w-4" aria-hidden />
              所有项目
            </Link>
            <Link href="/invitations" className="ac-btn">
              <Bell className="h-4 w-4" aria-hidden />
              消息中心
            </Link>
          </>
        }
      />

      <section
        aria-label="工作概览"
        className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <StatCard
          href={workbenchHref("mine")}
          active={view === "mine"}
          icon={ListChecks}
          label="我的未完成任务"
          value={data.summary.assignedOpen}
          hint={`${doingCount} 项进行中`}
        />
        <StatCard
          href={workbenchHref("today")}
          active={view === "today"}
          icon={Sun}
          label="今日待办"
          value={data.summary.today}
          hint={`未来 7 天另有 ${data.summary.dueSoon} 项`}
        />
        <StatCard
          href={workbenchHref("overdue")}
          active={view === "overdue"}
          icon={AlertTriangle}
          label="逾期任务"
          value={data.summary.overdue}
          hint={data.summary.overdue > 0 ? "需要优先处理" : "目前没有逾期"}
          tone="danger"
        />
        <StatCard
          href={workbenchHref("review")}
          active={view === "review"}
          icon={ClipboardCheck}
          label="待审核"
          value={data.summary.reviewAttention}
          hint={`待我 ${data.summary.reviewQueue} · 我提交 ${data.summary.submittedReviews}`}
          tone="warm"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.9fr)]">
        <section className="ac-panel min-w-0 overflow-hidden">
          <div className="border-b border-line px-3 pt-3 sm:px-5">
            <nav
              aria-label="工作台视图"
              className="grid grid-cols-5 gap-0.5 pb-2 sm:flex sm:gap-1"
            >
              {tabs.map((tab) => {
                const active = view === tab.view;
                return (
                  <Link
                    key={tab.view}
                    href={workbenchHref(tab.view)}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-field border px-1 py-2 text-[11px] transition-colors sm:shrink-0 sm:gap-1.5 sm:px-3 sm:text-sm ${
                      active
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-transparent text-ink-soft hover:bg-primary-soft hover:text-primary"
                    }`}
                  >
                    {TAB_LABEL[tab.view]}
                    {tab.count !== undefined && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                          active
                            ? "bg-white/18 text-white"
                            : "bg-sunken text-ink-soft"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {view === "mine" && (
            <TaskPanel
              title="我的任务"
              description="所有分配给我、尚未完成的任务，按截止日期排序。"
              tasks={data.tasks}
              today={data.today}
              emptyText="目前没有分配给你的未完成任务。"
            />
          )}
          {view === "today" && (
            <TaskPanel
              title="今日待办"
              description="截止日期在今天、仍需推进的任务。"
              tasks={data.todayTasks}
              today={data.today}
              emptyText="今天没有到期任务，可以从未来任务中提前推进一项。"
            />
          )}
          {view === "overdue" && (
            <TaskPanel
              title="逾期任务"
              description="已经超过截止日期但仍未完成的任务。"
              tasks={data.overdueTasks}
              today={data.today}
              emptyText="没有逾期任务，节奏保持得很好。"
              emphasizeOverdue
            />
          )}
          {view === "review" && (
            <ReviewPanel
              queue={data.reviewQueue}
              submitted={submittedOnly}
              today={data.today}
            />
          )}
          {view === "personal" && (
            <PersonalPanel
              data={data}
              doingCount={doingCount}
            />
          )}
        </section>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-24 xl:self-start">
          <PersonalSnapshot data={data} />
          <RecentVisitsPanel items={data.recentVisits} />
          <RecentActivityPanel items={data.recentActivity} />
        </aside>
      </div>
    </main>
  );
}

function StatCard({
  href,
  active,
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  href: string;
  active: boolean;
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone?: "default" | "danger" | "warm";
}) {
  const iconTone =
    tone === "danger"
      ? "bg-high-soft text-high"
      : tone === "warm"
        ? "bg-medium-soft text-medium"
        : "bg-primary-soft text-primary";
  const accent =
    tone === "danger"
      ? "bg-high"
      : tone === "warm"
        ? "bg-medium"
        : "bg-primary";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`ac-card group relative overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop ${
        active ? "border-primary-ring ring-2 ring-primary-ring/45" : ""
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-0.5 ${accent} ${
          active ? "opacity-100" : "opacity-55"
        }`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ink-soft">{label}</p>
          <p className="mt-1.5 font-display text-[2rem] font-semibold leading-none tabular-nums text-ink">
            {value}
          </p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-field ${iconTone}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2.5 truncate text-[11px] text-ink-faint">{hint}</p>
    </Link>
  );
}

function TaskPanel({
  title,
  description,
  tasks,
  today,
  emptyText,
  emphasizeOverdue = false,
}: {
  title: string;
  description: string;
  tasks: WorkbenchTask[];
  today: string;
  emptyText: string;
  emphasizeOverdue?: boolean;
}) {
  const visibleTasks = tasks.slice(0, 80);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-faint">{description}</p>
        </div>
        <span className="text-xs tabular-nums text-ink-faint">
          共 {tasks.length} 项
        </span>
      </div>
      {visibleTasks.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              emphasizeOverdue={emphasizeOverdue}
            />
          ))}
        </ul>
      )}
      {tasks.length > visibleTasks.length && (
        <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
          当前显示前 {visibleTasks.length} 项，请到项目看板继续查看。
        </p>
      )}
    </div>
  );
}

function TaskRow({
  task,
  today,
  emphasizeOverdue,
}: {
  task: WorkbenchTask;
  today: string;
  emphasizeOverdue: boolean;
}) {
  const due = dueState(task.dueDate, today);
  const statusTone = STATUS_TONE[task.statusColor ?? "slate"];
  const overdue = due.kind === "overdue";

  return (
    <li>
      <Link
        href={`/projects/${task.projectId}?sprint=all`}
        className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-primary-soft/45 sm:px-5"
      >
        <span
          aria-hidden
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
            overdue ? "bg-high" : task.status === "doing" ? "bg-primary" : "bg-todo"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {task.taskNumber !== null && (
              <span className="text-[11px] font-semibold tabular-nums text-ink-faint">
                #{task.taskNumber}
              </span>
            )}
            <span className={`ac-badge ${WORK_ITEM_TYPE_BADGE[task.workItemType]}`}>
              {WORK_ITEM_TYPE_LABEL[task.workItemType]}
            </span>
            <span className={`ac-badge ${statusTone}`}>
              {task.statusName ?? STATUS_FALLBACK[task.status]}
            </span>
            {task.priority === "high" && (
              <span className={`text-[11px] font-medium ${PRIORITY_TONE.high}`}>
                {PRIORITY_LABEL.high}
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-ink group-hover:text-primary">
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
            <span className="truncate">
              {task.teamName} / {task.projectName}
            </span>
            <span
              className={`inline-flex items-center gap-1 whitespace-nowrap ${
                overdue
                  ? "font-medium text-high"
                  : emphasizeOverdue
                    ? "text-high"
                    : due.kind === "today"
                      ? "font-medium text-medium"
                      : ""
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {due.label}
            </span>
            {task.estimate !== null && (
              <span className="whitespace-nowrap">{task.estimate} 点</span>
            )}
          </div>
        </div>
        <ArrowRight
          className="mt-2 h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function ReviewPanel({
  queue,
  submitted,
  today,
}: {
  queue: PendingTaskReview[];
  submitted: SubmittedWorkbenchReview[];
  today: string;
}) {
  const empty = queue.length === 0 && submitted.length === 0;

  return (
    <div>
      <div className="px-5 pb-3 pt-4">
        <h2 className="font-display text-lg font-semibold text-ink">待审核</h2>
        <p className="mt-0.5 text-xs text-ink-faint">
          管理员需要处理的提交，以及我提交后等待项目管理员确认的任务。
        </p>
      </div>

      {empty ? (
        <EmptyState text="目前没有需要处理的审核。" />
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {queue.length > 0 && (
            <section>
              <div className="flex items-center justify-between gap-2 bg-sunken/55 px-5 py-2">
                <h3 className="text-xs font-semibold text-ink-soft">待我审核</h3>
                <span className="text-xs tabular-nums text-ink-faint">
                  {queue.length} 项
                </span>
              </div>
              <ul className="divide-y divide-line">
                {queue.map((review) => (
                  <li key={review.id}>
                    <Link
                      href={`/reviews/${review.id}`}
                      className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-primary-soft/45 sm:px-5"
                    >
                      <ClipboardCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-medium"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                          {review.taskTitle}
                        </p>
                        <p className="mt-1 text-xs text-ink-faint">
                          {review.projectName} · {review.submittedByName ?? "已注销用户"} 提交 ·{" "}
                          {review.attachmentsCount} 个文件
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-faint">
                        {formatDateTime(review.submittedAt)}
                      </span>
                      <ArrowRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-primary"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {submitted.length > 0 && (
            <section>
              <div className="flex items-center justify-between gap-2 bg-sunken/55 px-5 py-2">
                <h3 className="text-xs font-semibold text-ink-soft">我提交的审核</h3>
                <span className="text-xs tabular-nums text-ink-faint">
                  {submitted.length} 项
                </span>
              </div>
              <ul className="divide-y divide-line">
                {submitted.map((review) => {
                  const due = dueState(review.dueDate, today);
                  return (
                    <li key={review.id}>
                      <Link
                        href={`/projects/${review.projectId}?task=${review.taskId}&sprint=all`}
                        className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-primary-soft/45 sm:px-5"
                      >
                        <Clock3
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                            {review.taskTitle}
                          </p>
                          <p className="mt-1 text-xs text-ink-faint">
                            {review.teamName} / {review.projectName} ·{" "}
                            {review.statusName ?? "待审核"} · {due.label}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-ink-faint">
                          {formatDateTime(review.submittedAt)}
                        </span>
                        <ArrowRight
                          className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-primary"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PersonalPanel({
  data,
  doingCount,
}: {
  data: MyWorkbench;
  doingCount: number;
}) {
  const maxProjectLoad = Math.max(
    1,
    ...data.projectLoad.map((project) => project.total),
  );

  return (
    <div>
      <div className="px-5 pb-3 pt-4">
        <h2 className="font-display text-lg font-semibold text-ink">个人视图</h2>
        <p className="mt-0.5 text-xs text-ink-faint">
          我的团队身份、任务负载与当前节奏。
        </p>
      </div>

      <div className="grid gap-6 border-t border-line px-5 py-5 md:grid-cols-2">
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <UsersRound className="h-4 w-4 text-primary" aria-hidden />
            团队身份
          </h3>
          {data.teams.length === 0 ? (
            <p className="mt-3 text-sm text-ink-faint">暂未加入团队。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.teams.map((team) => (
                <li
                  key={team.id}
                  className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="truncate text-ink">{team.name}</span>
                  <span className="ac-badge bg-primary-soft text-primary">
                    {ROLE_LABEL[team.role]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CheckCircle2 className="h-4 w-4 text-done" aria-hidden />
            本周节奏
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Metric label="近 7 天完成" value={data.summary.completedLast7Days} />
            <Metric label="进行中" value={doingCount} />
            <Metric label="未来 7 天到期" value={data.summary.dueSoon} />
            <Metric
              label="待审核"
              value={data.summary.reviewAttention}
              tone={data.summary.reviewAttention > 0 ? "warm" : undefined}
            />
          </dl>
        </section>
      </div>

      <section className="border-t border-line px-5 py-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FolderKanban className="h-4 w-4 text-primary" aria-hidden />
              项目负载
            </h3>
            <p className="mt-1 text-xs text-ink-faint">
              仅统计分配给我、仍未完成的任务。
            </p>
          </div>
          <span className="text-xs tabular-nums text-ink-faint">
            {data.projectLoad.length} 个项目
          </span>
        </div>
        {data.projectLoad.length === 0 ? (
          <p className="mt-4 text-sm text-ink-faint">当前没有任务负载。</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {data.projectLoad.map((project) => (
              <ProjectLoadRow
                key={project.projectId}
                project={project}
                max={maxProjectLoad}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProjectLoadRow({
  project,
  max,
}: {
  project: WorkbenchProjectLoad;
  max: number;
}) {
  return (
    <li>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{project.projectName}</p>
          <p className="mt-0.5 truncate text-xs text-ink-faint">
            {project.teamName}
            {project.overdue > 0 ? ` · ${project.overdue} 项逾期` : ""}
            {project.today > 0 ? ` · 今日 ${project.today} 项` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-ink-soft">
          {project.total} 项
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div
          className={`h-full rounded-full ${
            project.overdue > 0 ? "bg-high" : "bg-primary"
          }`}
          style={{ width: `${Math.max(6, (project.total / max) * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        <span>待办 {project.todo}</span>
        <span>进行中 {project.doing}</span>
        {project.estimate > 0 && <span>{project.estimate} 故事点</span>}
      </div>
    </li>
  );
}

function PersonalSnapshot({ data }: { data: MyWorkbench }) {
  return (
    <section className="ac-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">个人概览</h2>
          <p className="mt-0.5 text-xs text-ink-faint">当前工作与消息状态</p>
        </div>
        <Link
          href={workbenchHref("personal")}
          className="text-xs text-primary hover:underline"
        >
          查看视图
        </Link>
      </div>
      <dl className="grid grid-cols-2 border-t border-line">
        <SnapshotMetric
          icon={ListChecks}
          label="未完成"
          value={data.summary.assignedOpen}
        />
        <SnapshotMetric
          icon={CheckCircle2}
          label="近 7 天完成"
          value={data.summary.completedLast7Days}
        />
        <SnapshotMetric
          icon={Bell}
          label="未读消息"
          value={data.summary.unreadNotifications}
          tone={data.summary.unreadNotifications > 0 ? "warm" : undefined}
        />
        <SnapshotMetric
          icon={UsersRound}
          label="所在团队"
          value={data.teams.length}
        />
      </dl>
    </section>
  );
}

function SnapshotMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "warm";
}) {
  return (
    <div className="border-b border-r border-line px-4 py-3.5 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
      <dt className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon
          className={`h-3.5 w-3.5 ${tone === "warm" ? "text-medium" : "text-primary"}`}
          aria-hidden
        />
        {label}
      </dt>
      <dd className="mt-1.5 font-display text-xl font-semibold tabular-nums text-ink">
        {value}
      </dd>
    </div>
  );
}

function RecentActivityPanel({ items }: { items: WorkbenchNotification[] }) {
  return (
    <section className="ac-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">最近活动</h2>
          <p className="mt-0.5 text-xs text-ink-faint">与我相关的任务动态</p>
        </div>
        <Link
          href="/invitations"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          全部消息
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="border-t border-line px-5 py-8 text-center">
          <Inbox className="mx-auto h-5 w-5 text-ink-faint" aria-hidden />
          <p className="mt-2 text-sm text-ink-faint">暂无最近活动。</p>
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((item) => {
            const Icon =
              item.type === "task_mention"
                ? AtSign
                : item.type === "task_comment"
                  ? MessageSquare
                  : RefreshCw;
            const href = item.taskId
              ? `/projects/${item.projectId}?task=${item.taskId}&sprint=all`
              : "/invitations";
            return (
              <li key={item.id}>
                <Link
                  href={href}
                  className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-primary-soft/45"
                >
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-field ${
                      item.readAt
                        ? "bg-sunken text-ink-faint"
                        : "bg-primary-soft text-primary"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p
                        className={`line-clamp-2 text-sm ${
                          item.readAt
                            ? "text-ink-soft"
                            : "font-medium text-ink"
                        }`}
                      >
                        {item.title}
                      </p>
                      {!item.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-ink-faint">
                      {item.projectName}
                      {item.actorName ? ` · ${item.actorName}` : ""} ·{" "}
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentVisitsPanel({ items }: { items: RecentVisit[] }) {
  return (
    <section className="ac-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">最近访问</h2>
          <p className="mt-0.5 text-xs text-ink-faint">最近打开的项目与任务</p>
        </div>
        <Link href="/search" className="text-xs text-primary hover:underline">
          全局搜索
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="border-t border-line px-5 py-8 text-center">
          <Clock3 className="mx-auto h-5 w-5 text-ink-faint" aria-hidden />
          <p className="mt-2 text-sm text-ink-faint">暂无访问记录。</p>
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.path}
                className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-primary-soft/45"
              >
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-field bg-sunken text-ink-faint group-hover:bg-primary-soft group-hover:text-primary">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                    {item.label}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                    {item.projectName} · {formatDateTime(item.visitedAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border-t border-line px-5 py-10 text-center">
      <Inbox className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
      <p className="mt-2 text-sm text-ink-faint">{text}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warm";
}) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd
        className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
          tone === "warm" ? "text-medium" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function workbenchHref(view: WorkbenchView) {
  return view === "mine" ? "/workbench" : `/workbench?view=${view}`;
}

function formatDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateKey}T12:00:00+08:00`));
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dueState(dueDate: string | null, today: string) {
  if (!dueDate) return { kind: "none" as const, label: "未设截止日" };
  if (dueDate < today) {
    return {
      kind: "overdue" as const,
      label: `逾期 ${dateDistance(dueDate, today)} 天`,
    };
  }
  if (dueDate === today) {
    return { kind: "today" as const, label: "今天到期" };
  }
  return {
    kind: "future" as const,
    label: `${dateDistance(today, dueDate)} 天后`,
  };
}

function dateDistance(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(Math.abs(end - start) / 86_400_000));
}
