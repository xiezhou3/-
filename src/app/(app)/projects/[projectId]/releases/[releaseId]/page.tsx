import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileText,
  GitPullRequest,
  Package,
  Rocket,
  Workflow,
  XCircle,
} from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getReleaseDelivery } from "@/lib/integrations";

const RELEASE_STATUS = {
  planned: { label: "计划中", className: "bg-medium-soft text-medium" },
  active: { label: "进行中", className: "bg-primary-soft text-primary" },
  released: { label: "已发布", className: "bg-done/12 text-done" },
  cancelled: { label: "已取消", className: "bg-sunken text-ink-soft" },
} as const;

export default async function ReleaseDeliveryPage({
  params,
}: {
  params: Promise<{ projectId: string; releaseId: string }>;
}) {
  const { projectId, releaseId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    !z.uuid().safeParse(projectId).success ||
    !z.uuid().safeParse(releaseId).success
  ) {
    notFound();
  }
  const data = await getReleaseDelivery(session.user.id, releaseId);
  if (!data) notFound();
  const meta = RELEASE_STATUS[data.release.status];
  const pct =
    data.release.taskCount > 0
      ? Math.round(
          (data.release.doneTaskCount / data.release.taskCount) * 100,
        )
      : 0;
  const stages = buildStages(data);
  const checklist = buildReleaseChecklist(data);
  const releaseNotes = buildReleaseNotes(data);

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <Link
          href={`/projects/${projectId}/planning?tab=releases`}
          className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回项目规划
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
                <Package className="h-5 w-5 text-accent" aria-hidden />
                {data.release.name}
              </h1>
              <span className={`ac-badge ${meta.className}`}>{meta.label}</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {data.release.startDate ?? "未设开始"} →{" "}
              {data.release.targetDate ?? "未设目标"}
              {data.release.releaseDate
                ? ` · 发布于 ${data.release.releaseDate}`
                : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Metric label="任务" value={`${data.release.doneTaskCount}/${data.release.taskCount}`} />
            <Metric label="故事点" value={String(data.release.estimateTotal)} />
            <Metric
              label="实际工时"
              value={`${formatHours(data.release.actualHours)}h`}
            />
          </div>
        </div>
      </header>

      <section className="ac-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              交付链路
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              根据 Pull Request、Pipeline、Deployment 和 Release 状态汇总。
            </p>
          </div>
          <span className="font-display text-xl font-semibold tabular-nums text-ink">
            {pct}%
          </span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-4">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <div key={stage.key} className="relative rounded-field border border-line bg-sunken/45 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-field ${stage.tone}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className={`ac-badge ${stage.badge}`}>
                    {stage.label}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">{stage.title}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {stage.detail ?? "等待外部事件"}
                </p>
                {index < stages.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-3 top-1/2 hidden h-px w-3 bg-line-strong md:block"
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ac-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="font-display text-base font-semibold text-ink">
              发布检查
            </h2>
          </div>
          <ul className="divide-y divide-line">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 ${checkTone(item.status)}`}>
                  {item.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : item.status === "blocked" ? (
                    <XCircle className="h-4 w-4" aria-hidden />
                  ) : (
                    <CircleDashed className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{item.label}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="ac-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <FileText className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="font-display text-base font-semibold text-ink">
              Release Notes
            </h2>
          </div>
          {releaseNotes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">
              完成 Release 任务后会自动生成变更说明。
            </p>
          ) : (
            <div className="space-y-4 px-4 py-4">
              {releaseNotes.map((group) => (
                <div key={group.type}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {group.label}
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {group.tasks.map((task) => (
                      <li key={task.id} className="flex items-start gap-2 text-sm text-ink-soft">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>
                          #{task.taskNumber ?? "—"} {task.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ac-card overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-base font-semibold text-ink">
              Release 任务
            </h2>
          </div>
          {data.tasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">
              尚未关联任务。
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/projects/${projectId}?task=${task.id}&sprint=all`}
                    className="group flex items-start gap-3 px-4 py-3 hover:bg-primary-soft/45"
                  >
                    <span className="mt-0.5 text-xs font-semibold tabular-nums text-ink-faint">
                      #{task.taskNumber ?? "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-ink-faint">
                        {task.statusName ?? task.status} · {task.estimate ?? 0} SP ·{" "}
                        {formatHours(task.actualHours)}h 实际
                      </p>
                    </div>
                    <span
                      className={`ac-badge ${
                        task.status === "done"
                          ? "bg-done/12 text-done"
                          : "bg-sunken text-ink-soft"
                      }`}
                    >
                      {task.status === "done" ? "完成" : "进行中"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ac-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="font-display text-base font-semibold text-ink">
              外部事件
            </h2>
            <span className="text-xs tabular-nums text-ink-faint">
              {data.events.length} 条
            </span>
          </div>
          {data.events.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">
              暂无关联的代码、流水线或部署事件。
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.events.map((event) => (
                <li key={event.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {event.title}
                    </p>
                    <StatusBadge status={event.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
                    <span>{event.integrationName}</span>
                    {event.branch && <span className="font-mono">{event.branch}</span>}
                    {event.commitSha && (
                      <span className="font-mono">{event.commitSha.slice(0, 8)}</span>
                    )}
                    <span>{formatDateTime(event.occurredAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function buildStages(data: Awaited<ReturnType<typeof getReleaseDelivery>>) {
  if (!data) return [];
  const pull = [...data.events]
    .filter((event) => event.eventType === "pull_request")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  const pipeline = [...data.events]
    .filter((event) => event.eventType === "pipeline")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  const deployment = [...data.events]
    .filter((event) => event.eventType === "deployment")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  const codes = [
    {
      key: "code",
      icon: GitPullRequest,
      title: "代码合并",
      event: pull,
      success: isSuccess(pull?.status),
    },
    {
      key: "pipeline",
      icon: Workflow,
      title: "构建与测试",
      event: pipeline,
      success: isSuccess(pipeline?.status),
    },
    {
      key: "deploy",
      icon: Rocket,
      title: "环境部署",
      event: deployment,
      success: isSuccess(deployment?.status),
    },
    {
      key: "release",
      icon: Package,
      title: "正式发布",
      event: null,
      success: data.release.status === "released",
    },
  ];
  return codes.map((stage) => ({
    ...stage,
    tone: stage.success
      ? "bg-done/12 text-done"
      : stage.event
        ? "bg-medium-soft text-medium"
        : "bg-sunken text-ink-faint",
    badge: stage.success
      ? "bg-done/12 text-done"
      : stage.event
        ? "bg-medium-soft text-medium"
        : "bg-sunken text-ink-soft",
    label: stage.success ? "已完成" : stage.event ? "处理中" : "待开始",
    detail: stage.event
      ? `${stage.event.title} · ${formatDateTime(stage.event.occurredAt)}`
      : stage.key === "release" && data.release.releaseDate
        ? data.release.releaseDate
        : null,
  }));
}

function isSuccess(status: string | null | undefined) {
  return ["success", "succeeded", "passed", "merged", "deployed"].includes(
    (status ?? "").toLowerCase(),
  );
}

function buildReleaseChecklist(
  data: NonNullable<Awaited<ReturnType<typeof getReleaseDelivery>>>,
) {
  const unfinished = data.tasks.filter((task) => task.status !== "done").length;
  const blockingBugs = data.tasks.filter(
    (task) =>
      task.workItemType === "bug" &&
      ["blocker", "critical"].includes(task.bugSeverity ?? "") &&
      task.status !== "done",
  ).length;
  const pipelineSuccess = data.events.some(
    (event) => event.eventType === "pipeline" && isSuccess(event.status),
  );
  const deploymentSuccess = data.events.some(
    (event) => event.eventType === "deployment" && isSuccess(event.status),
  );
  return [
    {
      label: "任务范围已完成",
      detail:
        unfinished === 0
          ? `${data.tasks.length} 个任务全部完成`
          : `仍有 ${unfinished} 个任务未完成`,
      status: unfinished === 0 ? ("done" as const) : ("blocked" as const),
    },
    {
      label: "阻断级缺陷",
      detail:
        blockingBugs === 0
          ? "没有未关闭的阻断/严重缺陷"
          : `仍有 ${blockingBugs} 个阻断/严重 Bug 未完成`,
      status: blockingBugs === 0 ? ("done" as const) : ("blocked" as const),
    },
    {
      label: "流水线状态",
      detail: pipelineSuccess ? "已收到成功流水线事件" : "尚未收到成功流水线事件",
      status: pipelineSuccess ? ("done" as const) : ("warning" as const),
    },
    {
      label: "部署状态",
      detail: deploymentSuccess ? "已收到成功部署事件" : "尚未收到成功部署事件",
      status: deploymentSuccess ? ("done" as const) : ("warning" as const),
    },
    {
      label: "正式发布",
      detail:
        data.release.status === "released"
          ? `发布于 ${data.release.releaseDate ?? "已发布"}`
          : "Release 尚未标记为已发布",
      status:
        data.release.status === "released"
          ? ("done" as const)
          : ("warning" as const),
    },
  ];
}

function buildReleaseNotes(
  data: NonNullable<Awaited<ReturnType<typeof getReleaseDelivery>>>,
) {
  const labels: Record<string, string> = {
    epic: "Epic",
    story: "新增与改进",
    task: "任务",
    bug: "缺陷修复",
  };
  const groups = new Map<string, typeof data.tasks>();
  for (const task of data.tasks.filter((item) => item.status === "done")) {
    const list = groups.get(task.workItemType) ?? [];
    list.push(task);
    groups.set(task.workItemType, list);
  }
  return ["epic", "story", "task", "bug"]
    .filter((type) => groups.has(type))
    .map((type) => ({
      type,
      label: labels[type],
      tasks: groups.get(type) ?? [],
    }));
}

function checkTone(status: "done" | "warning" | "blocked") {
  if (status === "done") return "text-done";
  if (status === "blocked") return "text-high";
  return "text-medium";
}

function StatusBadge({ status }: { status: string | null }) {
  const failed = ["failure", "failed", "error", "cancelled"].includes(
    (status ?? "").toLowerCase(),
  );
  const success = isSuccess(status);
  if (failed) {
    return (
      <span className="ac-badge bg-high-soft text-high">
        <XCircle className="h-3 w-3" aria-hidden />
        {status}
      </span>
    );
  }
  if (success) {
    return (
      <span className="ac-badge bg-done/12 text-done">
        <CheckCircle2 className="h-3 w-3" aria-hidden />
        {status}
      </span>
    );
  }
  return (
    <span className="ac-badge bg-medium-soft text-medium">
      <CircleDashed className="h-3 w-3" aria-hidden />
      {status ?? "待定"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border border-line px-3 py-2 text-right">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
