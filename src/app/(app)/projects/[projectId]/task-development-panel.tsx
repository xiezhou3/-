"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  GitBranch,
  GitPullRequest,
  Rocket,
  Workflow,
  XCircle,
} from "lucide-react";
import { loadTaskDevelopmentEventsAction } from "./task-development-actions";
import type { IntegrationProvider } from "@/db/schema";

type EventView = {
  id: string;
  provider: IntegrationProvider;
  eventType: string;
  action: string | null;
  title: string;
  url: string | null;
  actor: string | null;
  branch: string | null;
  commitSha: string | null;
  environment: string | null;
  status: string | null;
  occurredAt: string | Date;
};

export function TaskDevelopmentPanel({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadTaskDevelopmentEventsAction(taskId)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载开发活动失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <section className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <GitBranch className="h-4 w-4 text-primary" aria-hidden />
          开发活动
        </h3>
        <span className="text-xs tabular-nums text-ink-faint">
          {events.length > 0 ? `${events.length} 条外部事件` : "未关联代码活动"}
        </span>
      </div>
      {loading ? (
        <p className="mt-3 text-xs text-ink-faint">正在加载开发活动…</p>
      ) : error ? (
        <p className="mt-3 text-xs text-high">{error}</p>
      ) : events.length === 0 ? (
        <p className="mt-3 rounded-field bg-sunken/60 p-3 text-xs text-ink-faint">
          在分支、Commit 或 PR 标题中加入任务编号（如 `#23`），外部事件会自动显示在这里。
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-start gap-2 rounded-field border border-line bg-surface px-3 py-2.5"
            >
              <span className={`mt-0.5 ${eventTone(event.status)}`}>
                <EventIcon event={event} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {event.url ? (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium text-ink hover:text-primary hover:underline"
                    >
                      {event.title}
                    </a>
                  ) : (
                    <span className="truncate text-sm font-medium text-ink">
                      {event.title}
                    </span>
                  )}
                  <span className="ac-badge bg-sunken text-ink-soft">
                    {event.eventType}
                  </span>
                  {event.status && (
                    <span className={`ac-badge ${eventBadge(event.status)}`}>
                      {event.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                  <span>{providerLabel(event.provider)}</span>
                  {event.actor && <span>{event.actor}</span>}
                  {event.branch && <span className="font-mono">{event.branch}</span>}
                  {event.commitSha && (
                    <span className="font-mono">{event.commitSha.slice(0, 8)}</span>
                  )}
                  {event.environment && <span>{event.environment}</span>}
                  <span>{formatDateTime(event.occurredAt)}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function EventIcon({ event }: { event: EventView }) {
  if (event.eventType === "pull_request") {
    return <GitPullRequest className="h-4 w-4" aria-hidden />;
  }
  if (event.eventType === "pipeline") {
    return <Workflow className="h-4 w-4" aria-hidden />;
  }
  if (event.eventType === "deployment") {
    return <Rocket className="h-4 w-4" aria-hidden />;
  }
  if (isFailure(event.status)) return <XCircle className="h-4 w-4" aria-hidden />;
  if (isSuccess(event.status)) return <CheckCircle2 className="h-4 w-4" aria-hidden />;
  return <CircleDashed className="h-4 w-4" aria-hidden />;
}

function eventTone(status: string | null) {
  if (isFailure(status)) return "text-high";
  if (isSuccess(status)) return "text-done";
  return "text-primary";
}

function eventBadge(status: string | null) {
  if (isFailure(status)) return "bg-high-soft text-high";
  if (isSuccess(status)) return "bg-done/12 text-done";
  return "bg-medium-soft text-medium";
}

function isSuccess(status: string | null) {
  return ["success", "succeeded", "passed", "merged", "deployed"].includes(
    (status ?? "").toLowerCase(),
  );
}

function isFailure(status: string | null) {
  return ["failure", "failed", "error", "cancelled"].includes(
    (status ?? "").toLowerCase(),
  );
}

function providerLabel(provider: IntegrationProvider) {
  return provider === "github"
    ? "GitHub"
    : provider === "gitlab"
      ? "GitLab"
      : provider === "ci"
        ? "CI/CD"
        : "Webhook";
}

function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
