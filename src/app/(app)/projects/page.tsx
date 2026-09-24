import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { auth } from "@/lib/auth";
import { listMyProjects } from "@/lib/project";
import { listProjectFileSummaries } from "@/lib/project-file-service";

export default async function AllProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const projects = await listMyProjects(session.user.id);
  const fileSummaries = await listProjectFileSummaries(
    projects.map((project) => project.id),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 py-8">
      <h1 className="font-display text-2xl font-semibold text-ink">所有项目</h1>
      {projects.length === 0 ? (
        <div className="ac-card p-8 text-center text-sm text-ink-soft">
          暂无项目——先在团队中创建。
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const pct = p.taskTotal > 0 ? Math.round((p.doneCount / p.taskTotal) * 100) : 0;
            const fileSummary = fileSummaries.get(p.id) ?? {
              total: 0,
              presentation: 0,
              video: 0,
              audio: 0,
              code: 0,
            };
            return (
              <li key={p.id} className="ac-card group p-4 transition-shadow hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/projects/${p.id}`}
                    className="min-w-0 truncate font-display text-base font-semibold text-ink group-hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  {p.status === "archived" ? (
                    <span className="ac-badge bg-low-soft text-low">已归档</span>
                  ) : (
                    <span className="ac-badge bg-done/12 text-done">进行中</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-faint">{p.teamName}</p>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-ink-soft">
                    <span>任务进度</span>
                    <span className="tabular-nums">
                      {p.doneCount}/{p.taskTotal}
                      {p.taskTotal > 0 ? ` · ${pct}%` : ""}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-done transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    文件 {fileSummary.total}
                  </span>
                  <span className="text-right text-ink-faint">
                    PPT {fileSummary.presentation} · 代码 {fileSummary.code} · 视频{" "}
                    {fileSummary.video} · 音频 {fileSummary.audio}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
