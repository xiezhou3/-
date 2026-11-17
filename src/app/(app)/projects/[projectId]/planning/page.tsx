import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Flag,
  Gauge,
  Milestone,
  Package,
  Target,
} from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getProjectPlanning,
  type ProjectPlanning,
} from "@/lib/planning";
import { CapacityManager } from "./capacity-manager";
import { ReleaseManager } from "./release-manager";
import {
  RoadmapTimeline,
  type RoadmapItem,
} from "./roadmap-timeline";

const TABS = [
  { id: "summary", label: "规划概览" },
  { id: "releases", label: "版本 / Release" },
  { id: "capacity", label: "团队容量" },
  { id: "roadmap", label: "路线图" },
] as const;

type PlanningTab = (typeof TABS)[number]["id"];

const RELEASE_STATUS_LABEL = {
  planned: "计划中",
  active: "进行中",
  released: "已发布",
  cancelled: "已取消",
} as const;

export default async function ProjectPlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();

  const data = await getProjectPlanning(session.user.id, projectId);
  if (!data) notFound();
  const query = await searchParams;
  const tab = resolveTab(query.tab);
  const requestedSprintId =
    typeof query.sprintId === "string" ? query.sprintId : null;
  const selectedCapacity =
    data.sprintCapacities.find(
      (capacity) => capacity.sprintId === requestedSprintId,
    ) ??
    data.sprintCapacities.find((capacity) => capacity.status === "active") ??
    data.sprintCapacities.find((capacity) => capacity.status === "planned") ??
    data.sprintCapacities[0] ??
    null;
  const canWrite = data.role === "admin" || data.role === "student";
  const today = todayKey();
  const roadmapItems = buildRoadmapItems(data);

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">
          项目规划
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          统一管理项目周期、里程碑、工时、团队容量、Release 与交付路线图。
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={`/projects/${projectId}/planning?tab=${item.id}`}
            aria-current={tab === item.id ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === item.id
                ? "border-primary font-medium text-primary"
                : "border-transparent text-ink-soft hover:text-primary"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "summary" && <PlanningSummary data={data} />}
      {tab === "releases" && (
        <ReleaseManager
          projectId={projectId}
          releases={data.releases}
          canWrite={canWrite}
        />
      )}
      {tab === "capacity" && (
        <div className="space-y-4">
          {data.sprintCapacities.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ink-soft">选择迭代</span>
              {data.sprintCapacities.map((capacity) => (
                <Link
                  key={capacity.sprintId}
                  href={`/projects/${projectId}/planning?tab=capacity&sprintId=${capacity.sprintId}`}
                  className={`rounded-field border px-2.5 py-1 text-xs ${
                    selectedCapacity?.sprintId === capacity.sprintId
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line bg-surface text-ink-soft hover:border-primary-ring"
                  }`}
                >
                  {capacity.sprintName}
                </Link>
              ))}
            </div>
          )}
          {selectedCapacity ? (
            <CapacityManager
              projectId={projectId}
              capacity={selectedCapacity}
              canWrite={canWrite}
            />
          ) : (
            <EmptyCard
              icon={Gauge}
              text="还没有可配置容量的迭代，请先到迭代管理创建 Sprint。"
              href={`/projects/${projectId}/sprints`}
              linkLabel="前往迭代管理"
            />
          )}
        </div>
      )}
      {tab === "roadmap" && (
        <RoadmapTimeline
          items={roadmapItems}
          projectStart={data.project.startDate}
          projectEnd={data.project.endDate}
          today={today}
        />
      )}
    </main>
  );
}

function PlanningSummary({ data }: { data: ProjectPlanning }) {
  const activeSprint =
    data.sprintCapacities.find((capacity) => capacity.status === "active") ?? null;
  const pointPct =
    data.summary.totalPoints > 0
      ? Math.round(
          (data.summary.completedPoints / data.summary.totalPoints) * 100,
        )
      : 0;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={CalendarDays}
          label="项目周期"
          value={`${data.project.startDate ?? "未设"} → ${data.project.endDate ?? "未设"}`}
          hint={`${data.summary.openMilestoneCount} 个开放里程碑`}
        />
        <SummaryCard
          icon={Target}
          label="故事点进度"
          value={`${data.summary.completedPoints}/${data.summary.totalPoints}`}
          hint={`${pointPct}% 已完成`}
        />
        <SummaryCard
          icon={Clock3}
          label="工时"
          value={`${formatHours(data.summary.actualHours)}/${formatHours(data.summary.estimatedHours)}h`}
          hint="实际 / 预估"
          tone={
            data.summary.estimatedHours > 0 &&
            data.summary.actualHours > data.summary.estimatedHours
              ? "danger"
              : "default"
          }
        />
        <SummaryCard
          icon={Package}
          label="版本 / Release"
          value={String(data.summary.releaseCount)}
          hint={`当前 Sprint 可用 ${formatHours(data.summary.availableHours)}h`}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ac-card overflow-hidden">
          <SectionHeader
            icon={Milestone}
            title="里程碑"
            detail={`${data.milestones.filter((item) => item.status === "open").length} 个开放`}
          />
          {data.milestones.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">
              暂无里程碑。
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.milestones.slice(0, 8).map((milestone) => (
                <li
                  key={milestone.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {milestone.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {milestone.targetDate ?? "未设目标日期"}
                    </p>
                  </div>
                  <span
                    className={`ac-badge ${
                      milestone.status === "done"
                        ? "bg-done/12 text-done"
                        : "bg-medium-soft text-medium"
                    }`}
                  >
                    {milestone.status === "done" ? "已完成" : "进行中"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ac-card overflow-hidden">
          <SectionHeader
            icon={Gauge}
            title="当前 Sprint"
            detail={activeSprint ? activeSprint.sprintName : "未启动"}
          />
          {activeSprint ? (
            <div className="space-y-4 border-t border-line p-4">
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric
                  label="故事点"
                  value={`${activeSprint.estimateTotal}/${activeSprint.storyPointCapacity}`}
                />
                <MiniMetric
                  label="可用小时"
                  value={`${formatHours(activeSprint.availableHours)}h`}
                />
                <MiniMetric
                  label="预估工时"
                  value={`${formatHours(activeSprint.estimatedHours)}h`}
                />
                <MiniMetric
                  label="实际工时"
                  value={`${formatHours(activeSprint.actualHours)}h`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-ink-faint">
                  <span>故事点负载</span>
                  <span>
                    {activeSprint.storyPointCapacity > 0
                      ? `${Math.round((activeSprint.estimateTotal / activeSprint.storyPointCapacity) * 100)}%`
                      : "未设容量"}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
                  <div
                    className={`h-full rounded-full ${
                      activeSprint.estimateTotal > activeSprint.storyPointCapacity
                        ? "bg-high"
                        : "bg-primary"
                    }`}
                    style={{
                      width: `${
                        activeSprint.storyPointCapacity > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (activeSprint.estimateTotal /
                                  activeSprint.storyPointCapacity) *
                                  100,
                              ),
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="border-t border-line px-4 py-8 text-center text-sm text-ink-faint">
              当前没有进行中的 Sprint。
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ac-card overflow-hidden">
          <SectionHeader
            icon={Flag}
            title="Release 进度"
            detail={`${data.releases.length} 个版本`}
          />
          {data.releases.length === 0 ? (
            <p className="border-t border-line px-4 py-8 text-center text-sm text-ink-faint">
              暂无 Release。
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.releases.slice(0, 6).map((release) => {
                const pct =
                  release.taskCount > 0
                    ? Math.round(
                        (release.doneTaskCount / release.taskCount) * 100,
                      )
                    : 0;
                return (
                  <li key={release.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">
                        {release.name}
                      </p>
                      <span className="text-xs tabular-nums text-ink-faint">
                        {release.doneTaskCount}/{release.taskCount}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-done"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {RELEASE_STATUS_LABEL[release.status]} ·{" "}
                      {release.targetDate ?? "未设目标"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ac-card overflow-hidden">
          <SectionHeader
            icon={Clock3}
            title="最近工时"
            detail={`${formatHours(data.summary.actualHours)}h 累计`}
          />
          {data.workLogs.length === 0 ? (
            <p className="border-t border-line px-4 py-8 text-center text-sm text-ink-faint">
              暂无工时记录。
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.workLogs.slice(0, 6).map((log) => (
                <li
                  key={log.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{log.taskTitle}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {log.userName ?? "已注销用户"} · {log.workDate}
                      {log.note ? ` · ${log.note}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    {formatHours(log.hours)}h
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="ac-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-ink-faint">{label}</p>
          <p className="mt-2 truncate font-display text-lg font-semibold text-ink">
            {value}
          </p>
        </div>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-field ${
            tone === "danger"
              ? "bg-high-soft text-high"
              : "bg-primary-soft text-primary"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-ink-faint">{hint}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Target;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        {title}
      </h2>
      <span className="text-xs text-ink-faint">{detail}</span>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field bg-sunken/60 p-3">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function EmptyCard({
  icon: Icon,
  text,
  href,
  linkLabel,
}: {
  icon: typeof Gauge;
  text: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="ac-card p-8 text-center">
      <Icon className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
      <p className="mt-2 text-sm text-ink-faint">{text}</p>
      <Link href={href} className="ac-btn mt-4 inline-flex">
        {linkLabel}
      </Link>
    </div>
  );
}

function buildRoadmapItems(data: ProjectPlanning): RoadmapItem[] {
  const releaseItems: RoadmapItem[] = [];
  for (const release of data.releases) {
    const start = release.startDate ?? release.targetDate ?? release.releaseDate;
    const end = release.releaseDate ?? release.targetDate ?? start;
    if (!start || !end) continue;
    releaseItems.push({
      id: release.id,
      title: release.name,
      kind: "release",
      startDate: start,
      endDate: end,
      status: RELEASE_STATUS_LABEL[release.status],
      progress:
        release.taskCount > 0
          ? Math.round((release.doneTaskCount / release.taskCount) * 100)
          : 0,
    });
  }

  const epicItems: RoadmapItem[] = data.tasks
    .filter(
      (task) =>
        task.workItemType === "epic" &&
        (task.startDate !== null || task.dueDate !== null),
    )
    .map((task) => {
      const start = task.startDate ?? task.dueDate!;
      const end = task.dueDate ?? task.startDate!;
      return {
        id: task.id,
        title: task.title,
        kind: "epic" as const,
        startDate: start,
        endDate: end,
        status: task.statusName ?? task.status,
        progress:
          task.status === "done"
            ? 100
            : task.status === "doing"
              ? 50
              : 0,
      };
    });

  const milestoneItems: RoadmapItem[] = data.milestones
    .filter(
      (milestone) =>
        milestone.targetDate !== null && milestone.status === "open",
    )
    .map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      kind: "milestone" as const,
      startDate: milestone.targetDate!,
      endDate: milestone.targetDate!,
      status: "里程碑",
    }));

  return [...releaseItems, ...epicItems, ...milestoneItems].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.title.localeCompare(b.title, "zh-CN"),
  );
}

function resolveTab(value: string | string[] | undefined): PlanningTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return TABS.some((tab) => tab.id === candidate)
    ? (candidate as PlanningTab)
    : "summary";
}

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
