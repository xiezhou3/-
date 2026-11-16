"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  X,
} from "lucide-react";

type MyTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
};

type Bucket = "overdue" | "today" | "week";

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-high-soft text-high",
  medium: "bg-medium-soft text-medium",
  low: "bg-low-soft text-low",
};
const PRIORITY_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

export function WorkspaceOverview({
  tasks,
  today,
  weekEnd,
  projects,
}: {
  tasks: MyTask[];
  today: string;
  weekEnd: string;
  projects: ReactNode;
}) {
  const [filter, setFilter] = useState<Bucket | null>(null);

  const isOverdue = (task: MyTask) => task.dueDate != null && task.dueDate < today;
  const isToday = (task: MyTask) => task.dueDate === today;
  const isThisWeek = (task: MyTask) =>
    task.dueDate != null && task.dueDate > today && task.dueDate <= weekEnd;

  const overdue = tasks.filter(isOverdue);
  const dueToday = tasks.filter(isToday);
  const dueThisWeek = tasks.filter(isThisWeek);

  const stats = [
    {
      key: "overdue" as const,
      label: "已逾期",
      value: overdue.length,
      icon: AlertTriangle,
      tone: "text-high",
      activeClass: "border-high/50 bg-high-soft/60 ring-2 ring-high/20",
    },
    {
      key: "today" as const,
      label: "今天到期",
      value: dueToday.length,
      icon: CalendarClock,
      tone: "text-accent",
      activeClass: "border-accent/50 bg-accent-soft/70 ring-2 ring-accent/20",
    },
    {
      key: "week" as const,
      label: "本周到期",
      value: dueThisWeek.length,
      icon: CalendarDays,
      tone: "text-primary",
      activeClass: "border-primary/40 bg-primary-soft ring-2 ring-primary/20",
    },
  ];

  const predicates: Record<Bucket, (task: MyTask) => boolean> = {
    overdue: isOverdue,
    today: isToday,
    week: isThisWeek,
  };

  const visible = filter ? tasks.filter(predicates[filter]) : tasks;
  const shown = visible.slice(0, filter ? 50 : 8);
  const filterLabel =
    filter === "overdue" ? "已逾期" : filter === "today" ? "今天到期" : "本周到期";

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="任务概况">
        {stats.map(({ key, label, value, icon: Icon, tone, activeClass }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              aria-controls="workspace-task-list"
              onClick={() => setFilter(active ? null : key)}
              title={active ? "再次点击取消筛选" : `只看${label}`}
              className={`ac-card flex items-center gap-3 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop ${
                active ? activeClass : "hover:border-line-strong"
              }`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken ${tone}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-ink-soft">{label}</span>
                <span className="block font-display text-2xl font-semibold leading-tight tabular-nums text-ink">
                  {value}
                </span>
              </span>
              <ChevronRight
                className={`h-4 w-4 shrink-0 transition-transform ${
                  active ? "rotate-90 text-primary" : "text-ink-faint"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section id="workspace-task-list" className="ac-card min-w-0 p-4" aria-labelledby="my-tasks-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 id="my-tasks-title" className="font-display text-lg font-semibold text-ink">
                我的任务
              </h2>
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary hover:text-white"
                  aria-label="清除筛选"
                >
                  {filterLabel} · {visible.length}
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
            <Link
              href="/projects"
              className="inline-flex items-center gap-0.5 text-xs text-ink-faint hover:text-primary"
            >
              全部项目
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {shown.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
              <p className="text-sm text-ink-soft">
                {filter ? `没有${filterLabel}的任务。` : "目前没有指派给你的未完成任务。"}
              </p>
              {!filter && (
                <p className="mt-1 text-xs text-ink-faint">
                  去项目的看板里认领一个，或让项目助手帮你拆解任务。
                </p>
              )}
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {shown.map((task) => {
                const taskOverdue = isOverdue(task);
                return (
                  <li key={task.id}>
                    <Link
                      href={`/projects/${task.projectId}?task=${task.id}`}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          taskOverdue ? "bg-high" : "bg-line-strong"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink group-hover:text-primary">
                          {task.title}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">
                          {task.projectName}
                        </span>
                      </span>
                      <span className={`ac-badge hidden sm:inline-flex ${PRIORITY_BADGE[task.priority]}`}>
                        {PRIORITY_LABEL[task.priority]}
                      </span>
                      <span
                        className={`shrink-0 text-xs tabular-nums ${
                          taskOverdue ? "font-medium text-high" : "text-ink-faint"
                        }`}
                      >
                        {task.dueDate ?? "未排期"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {!filter && visible.length > shown.length && (
            <p className="mt-2 text-xs text-ink-faint">
              仅显示最近 {shown.length} 条，点上方指标可查看对应区间。
            </p>
          )}
        </section>

        {projects}
      </div>
    </div>
  );
}
