import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  FolderKanban,
  History,
  ListTodo,
  Package,
  Search,
  UsersRound,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { searchGlobally } from "@/lib/search";
import { listRecentVisits } from "@/lib/recent-visits";
import { WORK_ITEM_TYPE_LABEL } from "@/lib/work-item";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const [results, recentVisits] = await Promise.all([
    searchGlobally(session.user.id, q),
    listRecentVisits(session.user.id, 8),
  ]);
  const hasResults =
    results.tasks.length +
      results.projects.length +
      results.teams.length +
      results.releases.length >
    0;

  return (
    <main className="mx-auto max-w-4xl space-y-6 py-8">
      <header>
        <p className="text-sm text-ink-soft">全局搜索</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          搜索任务、项目、团队与 Release
        </h1>
        <form action="/search" className="mt-4 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={q}
              className="ac-field pl-9"
              placeholder="输入标题、项目名、任务编号（如 #23）"
              aria-label="全局搜索"
              autoFocus
            />
          </label>
          <button className="ac-btn shrink-0">搜索</button>
        </form>
      </header>

      {!results.query ? (
        <RecentVisitsSection visits={recentVisits} />
      ) : !hasResults ? (
        <section className="ac-card p-10 text-center">
          <Search className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
          <p className="mt-3 text-sm text-ink-soft">没有找到匹配结果。</p>
          {results.taskNumber !== null && (
            <p className="mt-1 text-xs text-ink-faint">
              已按任务编号 #{results.taskNumber} 搜索。
            </p>
          )}
        </section>
      ) : (
        <div className="space-y-5">
          {results.tasks.length > 0 && (
            <ResultSection
              icon={ListTodo}
              title="任务"
              count={results.tasks.length}
            >
              {results.tasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/projects/${task.projectId}?task=${task.id}&sprint=all`}
                  className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-primary-soft/45"
                >
                  <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold tabular-nums text-ink-faint">
                    #{task.taskNumber ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {task.teamName} / {task.projectName} ·{" "}
                      {WORK_ITEM_TYPE_LABEL[task.workItemType as keyof typeof WORK_ITEM_TYPE_LABEL] ??
                        task.workItemType}{" "}
                      · {task.statusName ?? task.status}
                      {task.dueDate ? ` · 截止 ${task.dueDate}` : ""}
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-primary" aria-hidden />
                </Link>
              ))}
            </ResultSection>
          )}

          {results.projects.length > 0 && (
            <ResultSection
              icon={FolderKanban}
              title="项目"
              count={results.projects.length}
            >
              {results.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-primary-soft/45"
                >
                  <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                      {project.name}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {project.teamName} · {project.status === "active" ? "进行中" : "已归档"}
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-primary" aria-hidden />
                </Link>
              ))}
            </ResultSection>
          )}

          {results.releases.length > 0 && (
            <ResultSection
              icon={Package}
              title="版本 / Release"
              count={results.releases.length}
            >
              {results.releases.map((release) => (
                <Link
                  key={release.id}
                  href={`/projects/${release.projectId}/planning?tab=releases`}
                  className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-primary-soft/45"
                >
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                      {release.name}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {release.projectName} · {release.targetDate ?? "未设目标日期"}
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-primary" aria-hidden />
                </Link>
              ))}
            </ResultSection>
          )}

          {results.teams.length > 0 && (
            <ResultSection icon={UsersRound} title="团队" count={results.teams.length}>
              {results.teams.map((team) => (
                <Link
                  key={team.id}
                  href="/teams"
                  className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-primary-soft/45"
                >
                  <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink group-hover:text-primary">
                    {team.name}
                  </p>
                  <span className="text-xs text-ink-faint">{roleLabel(team.role)}</span>
                </Link>
              ))}
            </ResultSection>
          )}
        </div>
      )}

      {results.query && recentVisits.length > 0 && (
        <RecentVisitsSection visits={recentVisits.slice(0, 5)} compact />
      )}
    </main>
  );
}

function ResultSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Search;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="ac-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          {title}
        </h2>
        <span className="text-xs tabular-nums text-ink-faint">{count}</span>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function RecentVisitsSection({
  visits,
  compact = false,
}: {
  visits: Awaited<ReturnType<typeof listRecentVisits>>;
  compact?: boolean;
}) {
  return (
    <section className="ac-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <History className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="font-display text-base font-semibold text-ink">最近访问</h2>
      </div>
      {visits.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-faint">
          打开项目或任务后，这里会显示最近访问记录。
        </p>
      ) : (
        <div className="divide-y divide-line">
          {visits.map((visit) => (
            <Link
              key={visit.id}
              href={visit.path}
              className={`group flex items-start gap-3 px-4 transition-colors hover:bg-primary-soft/45 ${
                compact ? "py-2.5" : "py-3.5"
              }`}
            >
              <History className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink group-hover:text-primary">
                  {visit.label}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {visit.projectName} · {formatDate(visit.visitedAt)}
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-primary" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function roleLabel(role: "admin" | "teacher" | "student") {
  return role === "admin" ? "管理员" : role === "teacher" ? "教师" : "学生";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
