import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { listMyProjects } from "@/lib/project";
import { listMyOpenTasks } from "@/lib/task";
import { PageHeader } from "@/components/layout/page-header";

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-high-soft text-high",
  medium: "bg-medium-soft text-medium",
  low: "bg-low-soft text-low",
};
const PRIORITY_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

function offsetDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("sv-SE");
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export default async function WorkspacePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [myTasks, myProjects] = await Promise.all([
    listMyOpenTasks(session.user.id),
    listMyProjects(session.user.id),
  ]);

  const today = offsetDate(0);
  const weekEnd = offsetDate(6);
  const overdue = myTasks.filter((task) => task.dueDate && task.dueDate < today);
  const dueToday = myTasks.filter((task) => task.dueDate === today);
  const dueThisWeek = myTasks.filter(
    (task) => task.dueDate && task.dueDate > today && task.dueDate <= weekEnd,
  );
  const activeProjects = myProjects.filter((project) => project.status !== "archived");

  const stats = [
    {
      label: "已逾期",
      value: overdue.length,
      icon: AlertTriangle,
      tone: "text-high",
    },
    {
      label: "今天到期",
      value: dueToday.length,
      icon: CalendarClock,
      tone: "text-accent",
    },
    {
      label: "本周到期",
      value: dueThisWeek.length,
      icon: CalendarDays,
      tone: "text-primary",
    },
  ];

  return (
    <main className="space-y-6">
      <PageHeader
        title={`${greeting()}，${session.user.name}`}
        meta={
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
            今天是 {today}
          </span>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="任务概况">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="ac-card flex items-center gap-3 p-4">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken ${tone}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-ink-soft">{label}</span>
              <span className="block font-display text-2xl font-semibold leading-tight tabular-nums text-ink">
                {value}
              </span>
            </span>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="ac-card min-w-0 p-4" aria-labelledby="my-tasks-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="my-tasks-title" className="font-display text-lg font-semibold text-ink">
              我的任务
            </h2>
            <Link
              href="/projects"
              className="inline-flex items-center gap-0.5 text-xs text-ink-faint hover:text-primary"
            >
              全部项目
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {myTasks.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
              <p className="text-sm text-ink-soft">目前没有指派给你的未完成任务。</p>
              <p className="mt-1 text-xs text-ink-faint">
                去项目的看板里认领一个，或让项目助手帮你拆解任务。
              </p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {myTasks.slice(0, 8).map((task) => {
                const isOverdue = task.dueDate != null && task.dueDate < today;
                return (
                  <li key={task.id}>
                    <Link
                      href={`/projects/${task.projectId}?task=${task.id}`}
                      className="group flex items-center gap-3 py-2.5"
                    >
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isOverdue ? "bg-high" : "bg-line-strong"
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
                          isOverdue ? "font-medium text-high" : "text-ink-faint"
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
        </section>

        <section className="ac-card min-w-0 p-4" aria-labelledby="my-projects-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="my-projects-title" className="font-display text-lg font-semibold text-ink">
              我的项目
            </h2>
            <Link
              href="/projects"
              className="inline-flex items-center gap-0.5 text-xs text-ink-faint hover:text-primary"
            >
              全部
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {activeProjects.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
              <p className="text-sm text-ink-soft">还没有进行中的项目。</p>
              <Link href="/teams" className="mt-2 inline-block text-xs text-primary hover:underline">
                去团队里创建一个
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {activeProjects.slice(0, 5).map((project) => {
                const pct =
                  project.taskTotal > 0
                    ? Math.round((project.doneCount / project.taskTotal) * 100)
                    : 0;
                return (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="group block rounded-lg p-2 transition-colors hover:bg-sunken"
                    >
                      <span className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink group-hover:text-primary">
                          {project.name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-faint">{pct}%</span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sunken">
                        <span
                          className="block h-full rounded-full bg-done"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-faint">
                        {project.teamName} · {project.doneCount}/{project.taskTotal} 个任务
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
