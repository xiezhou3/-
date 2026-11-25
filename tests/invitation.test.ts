import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamInvitations, teamMembers } from "@/db/schema";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import {
  countMyPendingInvitations,
  inviteTeamMember,
  listMyInvitations,
  listPendingTeamInvitations,
  respondToInvitation,
  revokeTeamInvitation,
} from "@/lib/invitation";
import { createUser } from "@/lib/user";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

describe("team invitations", () => {
  beforeEach(resetDb);

  it("管理员按邮箱邀请，规范化邮箱并创建待接受邀请", async () => {
    const owner = await makeUser("owner@example.com");
    const team = await createTeam(owner.id, "东吴实验室");

    const invitation = await inviteTeamMember(owner.id, team.id, {
      email: " Student@Example.COM ",
      name: "小乔",
    });

    expect(invitation.email).toBe("student@example.com");
    expect(invitation.name).toBe("小乔");
    expect(invitation.status).toBe("pending");
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("只有管理员可以发送邀请", async () => {
    const owner = await makeUser("owner@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const student = await makeUser("student@example.com");
    await joinTeam(student.id, team.inviteCode);

    await expect(
      inviteTeamMember(student.id, team.id, { email: "new@example.com" }),
    ).rejects.toThrow("没有权限");
  });

  it("同一团队同一邮箱只保留一条待接受邀请，再次邀请刷新期限", async () => {
    const owner = await makeUser("owner@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const first = await inviteTeamMember(owner.id, team.id, {
      email: "student@example.com",
      name: "旧姓名",
    });

    const second = await inviteTeamMember(owner.id, team.id, {
      email: "STUDENT@example.com",
      name: "新姓名",
    });

    const rows = await db.select().from(teamInvitations);
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("新姓名");
    expect(second.expiresAt.getTime()).toBeGreaterThanOrEqual(first.expiresAt.getTime());
  });

  it("已是团队成员时拒绝邀请", async () => {
    const owner = await makeUser("owner@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const student = await makeUser("student@example.com");
    await joinTeam(student.id, team.inviteCode);

    await expect(
      inviteTeamMember(owner.id, team.id, { email: student.email }),
    ).rejects.toThrow("该邮箱已是团队成员");
  });

  it("受邀邮箱接受后加入为普通成员，重复接受不重复插入", async () => {
    const owner = await makeUser("owner@example.com");
    const student = await makeUser("student@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const invitation = await inviteTeamMember(owner.id, team.id, {
      email: student.email,
    });

    await respondToInvitation(student.id, invitation.id, "accept");
    await respondToInvitation(student.id, invitation.id, "accept");

    const members = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, student.id)));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("student");

    const [stored] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, invitation.id));
    expect(stored.status).toBe("accepted");
    expect(stored.acceptedById).toBe(student.id);
  });

  it("非受邀邮箱不能接受邀请", async () => {
    const owner = await makeUser("owner@example.com");
    const wrongUser = await makeUser("wrong@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const invitation = await inviteTeamMember(owner.id, team.id, {
      email: "student@example.com",
    });

    await expect(
      respondToInvitation(wrongUser.id, invitation.id, "accept"),
    ).rejects.toThrow("该邀请不属于当前登录邮箱");
  });

  it("过期邀请不可接受", async () => {
    const owner = await makeUser("owner@example.com");
    const student = await makeUser("student@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const invitation = await inviteTeamMember(owner.id, team.id, {
      email: student.email,
    });
    await db
      .update(teamInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(teamInvitations.id, invitation.id));

    await expect(
      respondToInvitation(student.id, invitation.id, "accept"),
    ).rejects.toThrow("邀请已过期");
  });

  it("拒绝邀请不会加入团队", async () => {
    const owner = await makeUser("owner@example.com");
    const student = await makeUser("student@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const invitation = await inviteTeamMember(owner.id, team.id, {
      email: student.email,
    });

    await respondToInvitation(student.id, invitation.id, "reject");

    const members = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, student.id)));
    const [stored] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, invitation.id));
    expect(members).toHaveLength(0);
    expect(stored.status).toBe("rejected");
  });

  it("管理员可撤销待接受邀请，受邀人的消息随即消失", async () => {
    const owner = await makeUser("owner@example.com");
    const student = await makeUser("student@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const invitation = await inviteTeamMember(owner.id, team.id, {
      email: student.email,
    });

    expect(await countMyPendingInvitations(student.id)).toBe(1);
    await revokeTeamInvitation(owner.id, team.id, invitation.id);
    expect(await countMyPendingInvitations(student.id)).toBe(0);
    expect(await listMyInvitations(student.id)).toHaveLength(0);
    await expect(
      respondToInvitation(student.id, invitation.id, "accept"),
    ).rejects.toThrow("邀请已处理");
  });

  it("管理员列表只显示未过期待接受邀请", async () => {
    const owner = await makeUser("owner@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const active = await inviteTeamMember(owner.id, team.id, {
      email: "active@example.com",
    });
    const expired = await inviteTeamMember(owner.id, team.id, {
      email: "expired@example.com",
    });
    await db
      .update(teamInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(teamInvitations.id, expired.id));

    const rows = await listPendingTeamInvitations(owner.id, team.id);
    expect(rows.map((row) => row.id)).toEqual([active.id]);
  });

  it("非管理员不能查看待接受邀请", async () => {
    const owner = await makeUser("owner@example.com");
    const team = await createTeam(owner.id, "东吴实验室");
    const teacher = await makeUser("teacher@example.com");
    await joinTeam(teacher.id, team.inviteCode);
    await updateMemberRole(owner.id, team.id, teacher.id, "teacher");

    await expect(listPendingTeamInvitations(teacher.id, team.id)).rejects.toThrow(
      "没有权限",
    );
  });
});
