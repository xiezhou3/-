import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { TeamForms } from "./team-forms";
import { TeamRenameButton } from "./team-rename-button";
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
        breadcrumbs={[{ label: "工作台", href: "/" }, { label: "团队" }]}
        title="我的团队"
        description="团队是成员、标签与资源的边界；项目在团队之下创建。"
      />
      {myTeams.length === 0 ? (
        <div className="ac-card p-8 text-center text-sm text-ink-soft">
          尚未加入任何团队——在下方创建一个，或凭邀请码加入。
        </div>
      ) : (
        <ul className="space-y-3">
          {myTeams.map((t) => (
            <li key={t.id} className="ac-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-base font-semibold text-ink">
                      {t.name}
                    </span>
                    <RoleBadge role={t.role} />
                    {t.role === "admin" && (
                      <TeamRenameButton teamId={t.id} name={t.name} />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    邀请码 <span className="font-mono text-ink-soft">{t.inviteCode}</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <Link href={`/teams/${t.id}/projects`} className="ac-btn-ghost">
                  项目
                </Link>
                <Link href={`/teams/${t.id}/resources`} className="ac-btn-ghost">
                  资源占用
                </Link>
                <Link href={`/teams/${t.id}/members`} className="ac-btn-ghost">
                  成员管理
                </Link>
                <Link href={`/teams/${t.id}/labels`} className="ac-btn-ghost">
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
  return <span className={`ac-badge ${cls}`}>{ROLE_LABEL[role] ?? role}</span>;
}
