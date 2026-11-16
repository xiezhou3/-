import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { CalendarRange, FolderKanban } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getTeamMembership } from "@/lib/team";
import { listTeamProjects } from "@/lib/project";
import { PageHeader } from "@/components/layout/page-header";
import { NewProjectDialog } from "@/app/(app)/projects/new-project-dialog";

export default async function TeamProjectsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(teamId).success) notFound();

  const me = await getTeamMembership(session.user.id, teamId);
  if (!me) notFound();

  const [team] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, teamId));
  if (!team) notFound();

  const projects = await listTeamProjects(session.user.id, teamId);
  const isAdmin = me.role === "admin";

  return (
    <main className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "工作台", href: "/" },
          { label: "团队", href: "/teams" },
          { label: team.name },
        ]}
        title="项目"
        meta={<span>{projects.length} 个项目</span>}
        actions={
          isAdmin ? (
            <NewProjectDialog
              teams={[{ id: teamId, name: team.name }]}
              fixedTeamId={teamId}
            />
          ) : null
        }
      />

      {projects.length === 0 ? (
        <div className="ac-card p-10 text-center">
          <FolderKanban className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
          <p className="mt-2 text-sm text-ink-soft">这个团队还没有项目。</p>
          {isAdmin && (
            <p className="mt-1 text-xs text-ink-faint">
              点右上角「新建项目」开始，先定名称与周期即可。
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="ac-card group flex h-full flex-col p-4 transition-shadow hover:shadow-pop"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-display text-base font-semibold text-ink group-hover:text-primary">
                    {project.name}
                  </span>
                  <span
                    className={`ac-badge shrink-0 ${
                      project.status === "archived"
                        ? "bg-low-soft text-low"
                        : "bg-done/12 text-done"
                    }`}
                  >
                    {project.status === "archived" ? "已归档" : "进行中"}
                  </span>
                </div>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                    {project.description}
                  </p>
                )}
                <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-xs text-ink-faint">
                  <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                  {project.startDate ?? "未设置"} 至 {project.endDate ?? "未设置"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
