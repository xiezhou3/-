import { and, eq, gt, sql } from "drizzle-orm";
import { db, type DbTx } from "@/db";
import { teamInvitations, teamMembers, teams, users } from "@/db/schema";
import { AppError, ForbiddenError, isUniqueViolation } from "./errors";
import { requireTeamRole } from "./team";

const INVITATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function nextExpiry() {
  return new Date(Date.now() + INVITATION_TTL_MS);
}

async function userEmail(userId: string, tx: DbTx | typeof db = db) {
  const [user] = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return user?.email ? normalizeEmail(user.email) : null;
}

async function existingMember(teamId: string, email: string) {
  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(eq(teamMembers.teamId, teamId), eq(users.email, email)));
  return member ?? null;
}

export async function inviteTeamMember(
  actorId: string,
  teamId: string,
  input: { email: string; name?: string | null },
) {
  await requireTeamRole(actorId, teamId, ["admin"]);

  const email = normalizeEmail(input.email);
  const name = input.name?.trim() || null;
  if (!email) throw new AppError("请填写邮箱");

  if (await existingMember(teamId, email)) {
    throw new AppError("该邮箱已是团队成员");
  }

  const [pending] = await db
    .select({ id: teamInvitations.id })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.teamId, teamId),
        eq(teamInvitations.email, email),
        eq(teamInvitations.status, "pending"),
      ),
    );

  if (pending) {
    const [updated] = await db
      .update(teamInvitations)
      .set({ name, invitedById: actorId, expiresAt: nextExpiry(), respondedAt: null })
      .where(eq(teamInvitations.id, pending.id))
      .returning();
    return updated;
  }

  try {
    const [invitation] = await db
      .insert(teamInvitations)
      .values({
        teamId,
        email,
        name,
        invitedById: actorId,
        expiresAt: nextExpiry(),
      })
      .returning();
    return invitation;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;

    const [updated] = await db
      .update(teamInvitations)
      .set({ name, invitedById: actorId, expiresAt: nextExpiry(), respondedAt: null })
      .where(
        and(
          eq(teamInvitations.teamId, teamId),
          eq(teamInvitations.email, email),
          eq(teamInvitations.status, "pending"),
        ),
      )
      .returning();
    if (updated) return updated;
    throw new AppError("邀请发送失败，请重试");
  }
}

export async function listPendingTeamInvitations(actorId: string, teamId: string) {
  await requireTeamRole(actorId, teamId, ["admin"]);
  return db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      name: teamInvitations.name,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
      invitedByName: users.name,
    })
    .from(teamInvitations)
    .innerJoin(users, eq(teamInvitations.invitedById, users.id))
    .where(
      and(
        eq(teamInvitations.teamId, teamId),
        eq(teamInvitations.status, "pending"),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(teamInvitations.createdAt);
}

export async function listMyInvitations(userId: string) {
  const email = await userEmail(userId);
  if (!email) return [];

  return db
    .select({
      id: teamInvitations.id,
      teamId: teamInvitations.teamId,
      teamName: teams.name,
      name: teamInvitations.name,
      email: teamInvitations.email,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
      invitedByName: users.name,
    })
    .from(teamInvitations)
    .innerJoin(teams, eq(teamInvitations.teamId, teams.id))
    .innerJoin(users, eq(teamInvitations.invitedById, users.id))
    .where(
      and(
        eq(teamInvitations.email, email),
        eq(teamInvitations.status, "pending"),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(teamInvitations.expiresAt);
}

export async function countMyPendingInvitations(userId: string) {
  const email = await userEmail(userId);
  if (!email) return 0;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.email, email),
        eq(teamInvitations.status, "pending"),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    );
  return row?.count ?? 0;
}

export async function respondToInvitation(
  userId: string,
  invitationId: string,
  response: "accept" | "reject",
) {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, invitationId))
      .for("update");

    if (!invitation) throw new AppError("邀请不存在或已处理");
    const email = await userEmail(userId, tx);
    if (!email || email !== normalizeEmail(invitation.email)) {
      throw new ForbiddenError("该邀请不属于当前登录邮箱");
    }
    if (invitation.status === "accepted" && response === "accept") {
      return { teamId: invitation.teamId, status: "accepted" as const };
    }
    if (invitation.status !== "pending") throw new AppError("邀请已处理");
    if (invitation.expiresAt <= new Date()) throw new AppError("邀请已过期");

    const respondedAt = new Date();
    if (response === "reject") {
      await tx
        .update(teamInvitations)
        .set({ status: "rejected", respondedAt })
        .where(eq(teamInvitations.id, invitationId));
      return { teamId: invitation.teamId, status: "rejected" as const };
    }

    await tx
      .insert(teamMembers)
      .values({ teamId: invitation.teamId, userId, role: "student" })
      .onConflictDoNothing();

    await tx
      .update(teamInvitations)
      .set({
        status: "accepted",
        respondedAt,
        acceptedById: userId,
      })
      .where(eq(teamInvitations.id, invitationId));

    return { teamId: invitation.teamId, status: "accepted" as const };
  });
}

export async function revokeTeamInvitation(
  actorId: string,
  teamId: string,
  invitationId: string,
) {
  await requireTeamRole(actorId, teamId, ["admin"]);
  const [revoked] = await db
    .update(teamInvitations)
    .set({ status: "revoked", respondedAt: new Date() })
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.teamId, teamId),
        eq(teamInvitations.status, "pending"),
      ),
    )
    .returning({ id: teamInvitations.id });

  if (!revoked) throw new AppError("待接受邀请不存在");
  return revoked;
}
