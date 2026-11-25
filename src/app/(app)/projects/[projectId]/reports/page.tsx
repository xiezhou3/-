import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Gauge,
  Package,
  Target,
} from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getSprintReportData } from "@/lib/report";
import { SprintCharts } from "./sprint-charts";

export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();
  const report = await getSprintReportData(session.user.id, projectId);
  if (!report) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">
          报表分析
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Sprint 进度、容量、燃尽情况与历史交付速度。
        </p>
      </header>

      {report.activeSprint && report.progress ? (
        <>
          <section className="ac-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-primary">当前 Sprint</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                  {report.activeSprint.name}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  {report.activeSprint.startDate} → {report.activeSprint.endDate}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Metric
                  icon={Gauge}
                  label="容量使用"
                  value={`${report.progress.totalPoints} / ${report.activeSprint.capacity} SP`}
                />
                <Metric
                  icon={Target}
                  label="剩余"
                  value={`${report.progress.remainingPoints} SP`}
                />
                {report.sprintCapacity && (
                  <Metric
                    icon={Clock3}
                    label="团队工时"
                    value={`${formatHours(report.sprintCapacity.actualHours)} / ${formatHours(report.sprintCapacity.availableHours)}h`}
                  />
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Stat label="任务完成" value={`${report.progress.taskDone} / ${report.progress.taskTotal}`} />
              <Stat label="故事点完成" value={`${report.progress.completedPoints} / ${report.progress.totalPoints}`} />
              <Stat label="未估算任务" value={String(report.progress.unestimated)} />
              <Stat label="剩余天数" value={String(report.progress.daysRemaining)} />
            </div>
            {report.activeSprint.goal && (
              <p className="mt-3 rounded-field bg-sunken/70 p-3 text-sm text-ink-soft">
                迭代目标：{report.activeSprint.goal}
              </p>
            )}
          </section>

          <SprintCharts
            burndown={report.burndown}
            velocity={report.velocity}
          />
        </>
      ) : (
        <div className="ac-card p-8 text-center">
          <p className="text-sm text-ink-soft">
            当前没有进行中的 Sprint。燃尽图会在 Sprint 启动后生成。
          </p>
          <Link href={`/projects/${projectId}/sprints`} className="ac-btn mt-4 inline-flex">
            前往迭代管理
          </Link>
        </div>
      )}

      {!report.activeSprint && report.velocity.length > 0 && (
        <SprintCharts burndown={[]} velocity={report.velocity} />
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="ac-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Clock3 className="h-4 w-4 text-primary" aria-hidden />
              工时执行
            </h2>
            <span className="text-xs text-ink-faint">
              {report.hours.estimatedTaskCount} 个任务已估时
            </span>
          </div>
          <div className="grid grid-cols-3 border-t border-line">
            <ReportMetric
              label="预估"
              value={`${formatHours(report.hours.estimatedHours)}h`}
            />
            <ReportMetric
              label="实际"
              value={`${formatHours(report.hours.actualHours)}h`}
            />
            <ReportMetric
              label="偏差"
              value={`${report.hours.varianceHours > 0 ? "+" : ""}${formatHours(report.hours.varianceHours)}h`}
              danger={report.hours.varianceHours > 0}
            />
          </div>
        </div>

        <div className="ac-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Package className="h-4 w-4 text-primary" aria-hidden />
              Release 交付
            </h2>
            <span className="text-xs text-ink-faint">
              {report.releases.length} 个版本
            </span>
          </div>
          {report.releases.length === 0 ? (
            <p className="border-t border-line px-4 py-8 text-center text-sm text-ink-faint">
              暂无版本数据。
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {report.releases.slice(0, 5).map((release) => {
                const pct =
                  release.taskCount > 0
                    ? Math.round(
                        (release.doneTaskCount / release.taskCount) * 100,
                      )
                    : 0;
                return (
                  <li key={release.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-ink">
                        {release.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-faint">
                        {release.doneTaskCount}/{release.taskCount} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-done"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <p className="text-xs text-ink-faint">
        实际燃尽线按任务完成时的最后更新时间估算；后续引入每日快照后可进一步提升历史精度。
      </p>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-field border border-line px-3 py-2">
      <p className="flex items-center gap-1 text-xs text-ink-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field bg-sunken/60 p-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="border-r border-line px-4 py-4 last:border-r-0">
      <p className="text-xs text-ink-faint">{label}</p>
      <p
        className={`mt-1 font-display text-xl font-semibold tabular-nums ${
          danger ? "text-high" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
