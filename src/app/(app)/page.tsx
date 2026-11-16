import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, FolderKanban } from "lucide-react";
import { auth } from "@/lib/auth";
import { listMyProjects } from "@/lib/project";
import { listMyOpenTasks } from "@/lib/task";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceOverview } from "./workspace-overview";

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
  const activeProjects = myProjects.filter((project) => project.status !== "archived");

  const projectsPanel = (
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
  );

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

      <WorkspaceOverview
        tasks={myTasks}
        today={today}
        weekEnd={weekEnd}
        projects={projectsPanel}
      />
    </main>
  );
}
