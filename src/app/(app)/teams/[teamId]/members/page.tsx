import { z } from "zod";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import { getTeamMembership } from "@/lib/team";
import { listPendingTeamInvitations } from "@/lib/invitation";
import { revokeInvitationAction, updateRoleAction } from "./actions";
import { InviteMemberForm } from "./invite-member-form";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  // teamId 来自 URL，非法 uuid 会导致后续查询报 DB 错误——提前拦截，语义上等同于「不存在」
  if (!z.uuid().safeParse(teamId).success) notFound();

  // 访问者必须是团队成员（非成员 404，不泄露团队存在性）
  const me = await getTeamMembership(session.user.id, teamId);
  if (!me) notFound();

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) notFound();

  const members = await db
    .select({ userId: users.id, name: users.name, email: users.email, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  const isAdmin = me.role === "admin";
  const pendingInvitations = isAdmin
    ? await listPendingTeamInvitations(session.user.id, teamId)
    : [];
  const sortedMembers = [...members].sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.name.localeCompare(b.name, "zh-CN"),
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 py-8">
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-soft">{team.name}</p>
            <h1 className="font-display text-2xl font-semibold text-ink">成员管理</h1>
          </div>
          <span className="text-sm text-ink-soft">共 {members.length} 人</span>
        </div>
        <ul className="space-y-2">
          {sortedMembers.map((m) => (
            <li key={m.userId} className="ac-card flex items-center justify-between gap-4 p-4">
              <span className="min-w-0 text-ink">
                <span className="block truncate">{m.name}</span>
                <span className="block truncate text-xs text-ink-soft">{m.email}</span>
              </span>
              {isAdmin && m.userId !== session.user.id ? (
                <form action={updateRoleAction} className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="userId" value={m.userId} />
                  {/* key=role：角色变更后强制重挂载，使 defaultValue 重新采纳（非受控 select 不更新已挂载节点） */}
                  <select key={m.role} name="role" defaultValue={m.role} className="ac-field w-auto py-1 text-sm">
                    <option value="admin">admin</option>
                    <option value="teacher">teacher</option>
                    <option value="student">student</option>
                  </select>
                  <button className="ac-btn px-2 py-1 text-xs">保存</button>
                </form>
              ) : (
                <span className="shrink-0 text-sm text-ink-soft">{ROLE_LABEL[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-lg font-semibold text-ink">待接受邀请</h2>
            <span className="text-sm text-ink-soft">{pendingInvitations.length} 条</span>
          </div>
          {pendingInvitations.length === 0 ? (
            <p className="ac-card p-4 text-sm text-ink-soft">暂无待接受邀请。</p>
          ) : (
            <ul className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="ac-card flex items-center justify-between gap-4 p-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ink">
                      {invitation.name || invitation.email}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {invitation.email} · {formatDate(invitation.createdAt)} 邀请 ·{" "}
                      {formatDate(invitation.expiresAt)} 到期
                    </span>
                  </span>
                  <form action={revokeInvitationAction} className="shrink-0">
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <button className="ac-btn-ghost px-2 py-1 text-xs">撤销</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && <InviteMemberForm teamId={teamId} />}
    </main>
  );
}

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  teacher: 1,
  student: 2,
};

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  teacher: "导师",
  student: "成员",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
