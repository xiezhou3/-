import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  FolderKanban,
  Layers3,
  UsersRound,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { listMyProjects } from "@/lib/project";
import { listProjectFileSummaries } from "@/lib/project-file-service";
import { PageHeader } from "@/components/layout/page-header";

export default async function AllProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const projects = await listMyProjects(session.user.id);
  const fileSummaries = await listProjectFileSummaries(
    projects.map((project) => project.id),
  );
  const activeProjects = projects.filter((project) => project.status === "active");
  const totalTasks = projects.reduce((sum, project) => sum + project.taskTotal, 0);
  const completedTasks = projects.reduce(
    (sum, project) => sum + project.doneCount,
    0,
  );
  const totalFiles = [...fileSummaries.values()].reduce(
    (sum, summary) => sum + summary.total,
    0,
  );
  const teamCount = new Set(projects.map((project) => project.teamName)).size;

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="项目总览"
        title="所有项目"
        description="跨团队查看项目进度、任务负担与资料沉淀。"
        meta={
          <span>
            共 {projects.length} 个项目 · {activeProjects.length} 个进行中
          </span>
        }
        actions={
          <Link href="/teams" className="ac-btn">
            <FolderKanban className="h-4 w-4" aria-hidden />
            去团队创建项目
          </Link>
        }
      />

      <section
        aria-label="项目摘要"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <SummaryCard
          icon={Layers3}
          label="进行中项目"
          value={String(activeProjects.length)}
          hint={`${projects.length - activeProjects.length} 个已归档`}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="任务完成"
          value={`${completedTasks}/${totalTasks}`}
          hint={
            totalTasks > 0
              ? `${Math.round((completedTasks / totalTasks) * 100)}% 完成率`
              : "暂无任务"
          }
        />
        <SummaryCard
          icon={FileText}
          label="项目资料"
          value={String(totalFiles)}
          hint="文档、代码与演示资产"
        />
        <SummaryCard
          icon={UsersRound}
          label="协作团队"
          value={String(teamCount)}
          hint="跨团队项目统一进入"
        />
      </section>

      {projects.length === 0 ? (
        <section className="ac-panel px-6 py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
            <FolderKanban className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink">
            还没有项目
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-soft">
            先进入团队创建项目，之后任务、资料、仓库与讨论会汇总到这里。
          </p>
          <Link href="/teams" className="ac-btn mt-5">
            前往团队
          </Link>
        </section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {projects.map((project) => {
            const pct =
              project.taskTotal > 0
                ? Math.round((project.doneCount / project.taskTotal) * 100)
                : 0;
            const fileSummary = fileSummaries.get(project.id) ?? {
              total: 0,
              presentation: 0,
              video: 0,
              audio: 0,
              code: 0,
            };
            const initial = Array.from(project.name.trim())[0] ?? "项";

            return (
              <li key={project.id} className="min-w-0">
                <Link
                  href={`/projects/${project.id}`}
                  className="ac-card group flex h-full min-h-60 flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-primary-ring hover:shadow-pop"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-primary-soft font-display text-base font-semibold text-primary ring-1 ring-primary-ring/50 transition-colors group-hover:bg-primary group-hover:text-white"
                    >
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-primary">
                          {project.name}
                        </h2>
                        <ArrowUpRight
                          className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                          aria-hidden
                        />
                      </div>
                      <p className="mt-1 truncate text-xs text-ink-faint">
                        {project.teamName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto pt-5">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-ink-soft">任务进度</span>
                      <span className="font-medium tabular-nums text-ink">
                        {project.doneCount}/{project.taskTotal}
                        <span className="ml-1 text-ink-faint">· {pct}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <span
                        className={`ac-badge ${
                          project.status === "archived"
                            ? "bg-sunken text-ink-soft"
                            : "bg-done/12 text-done"
                        }`}
                      >
                        {project.status === "archived" ? "已归档" : "进行中"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        {fileSummary.total} 份资料
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="ac-card flex items-center gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-field bg-primary-soft text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-ink-faint">{label}</p>
        <p className="font-display text-xl font-semibold leading-tight tabular-nums text-ink">
          {value}
        </p>
        <p className="truncate text-[11px] text-ink-faint">{hint}</p>
      </div>
    </div>
  );
}
