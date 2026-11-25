import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  FolderKanban,
  Layers3,
  Settings2,
  ShieldCheck,
  Tags,
  UserRound,
  UsersRound,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { TeamForms } from "./team-forms";
import { TeamDisbandButton } from "./team-disband-button";
import { PageHeader } from "@/components/layout/page-header";

export default async function TeamsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const myTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      inviteCode: teams.inviteCode,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, session.user.id));

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="协作空间"
        title="我的团队"
        description="按团队管理项目、成员、资源与标签，所有工作都会汇总到个人工作台。"
        meta={
          <span>
            已加入 {myTeams.length} 个团队 ·{" "}
            {myTeams.filter((team) => team.role === "admin").length} 个管理员身份
          </span>
        }
      />

      {myTeams.length === 0 ? (
        <section className="ac-panel px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
            <UsersRound className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink">
            尚未加入团队
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            在下方创建团队，或使用团队邀请码加入。
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {myTeams.map((t) => (
            <li key={t.id} className="ac-card min-w-0 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-primary-soft font-display text-base font-semibold text-primary">
                    {Array.from(t.name.trim())[0] ?? "团"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-base font-semibold text-ink">
                      {t.name}
                    </span>
                    <RoleBadge role={t.role} />
                    </div>
                    <p className="mt-1 text-xs text-ink-faint">
                      邀请码{" "}
                      <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                        {t.inviteCode}
                      </span>
                    </p>
                  </div>
                </div>
                {t.role === "admin" && (
                  <TeamDisbandButton teamId={t.id} teamName={t.name} />
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-4">
                <Link href={`/teams/${t.id}/projects`} className="ac-btn-ghost justify-start">
                  <FolderKanban className="h-3.5 w-3.5" aria-hidden />
                  项目
                </Link>
                <Link href={`/teams/${t.id}/resources`} className="ac-btn-ghost justify-start">
                  <Layers3 className="h-3.5 w-3.5" aria-hidden />
                  资源
                </Link>
                <Link href={`/teams/${t.id}/members`} className="ac-btn-ghost justify-start">
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                  成员
                </Link>
                <Link href={`/teams/${t.id}/labels`} className="ac-btn-ghost justify-start">
                  <Tags className="h-3.5 w-3.5" aria-hidden />
                  标签
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <TeamForms />
    </main>
  );
}

const ROLE_LABEL: Record<string, string> = { admin: "管理员", teacher: "导师", student: "成员" };

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "admin"
      ? "bg-primary-soft text-primary"
      : role === "teacher"
        ? "bg-accent-soft text-accent"
        : "bg-low-soft text-low";
  return (
    <span className={`ac-badge ${cls}`}>
      {role === "admin" ? (
        <ShieldCheck className="h-3 w-3" aria-hidden />
      ) : role === "teacher" ? (
        <Settings2 className="h-3 w-3" aria-hidden />
      ) : (
        <UsersRound className="h-3 w-3" aria-hidden />
      )}
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}
