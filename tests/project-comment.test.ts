import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/project";
import {
  createProjectComment,
  deleteProjectComment,
  listProjectComments,
  updateProjectComment,
} from "@/lib/project-comment";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createUser } from "@/lib/user";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function makeProject() {
  const owner = await makeUser("owner@example.com");
  const student = await makeUser("student@example.com");
  const other = await makeUser("other@example.com");
  const team = await createTeam(owner.id, "评论测试团队");
  await joinTeam(student.id, team.inviteCode);
  const project = await createProject(owner.id, team.id, { name: "评论测试项目" });
  return { owner, student, other, team, project };
}

describe("project comments", () => {
  beforeEach(resetDb);

  it("团队成员可评论，非成员不可见也不可写入", async () => {
    const { owner, student, other, project } = await makeProject();
    await createProjectComment(student.id, project.id, { content: "第一条评论" });

    const page = await listProjectComments(owner.id, project.id);
    expect(page.totalCount).toBe(1);
    expect(page.threads[0].comment.content).toBe("第一条评论");
    expect(page.threads[0].comment.authorName).toBe("student");

    await expect(
      createProjectComment(other.id, project.id, { content: "越权" }),
    ).rejects.toThrow("没有权限");
    await expect(listProjectComments(other.id, project.id)).rejects.toThrow(
      "没有权限",
    );
  });

  it("支持一级回复并拒绝二级回复", async () => {
    const { owner, student, project } = await makeProject();
    const root = await createProjectComment(owner.id, project.id, {
      content: "顶层",
    });
    const reply = await createProjectComment(student.id, project.id, {
      content: "一级回复",
      parentId: root.id,
    });

    const page = await listProjectComments(owner.id, project.id);
    expect(page.threads).toHaveLength(1);
    expect(page.threads[0].replies).toHaveLength(1);
    expect(page.threads[0].replies[0].content).toBe("一级回复");

    await expect(
      createProjectComment(owner.id, project.id, {
        content: "二级回复",
        parentId: reply.id,
      }),
    ).rejects.toThrow("只支持一级回复");
  });

  it("父评论必须属于同一项目", async () => {
    const { owner, project } = await makeProject();
    const second = await createProject(owner.id, project.teamId, {
      name: "另一个项目",
    });
    const root = await createProjectComment(owner.id, project.id, {
      content: "原项目评论",
    });

    await expect(
      createProjectComment(owner.id, second.id, {
        content: "跨项目回复",
        parentId: root.id,
      }),
    ).rejects.toThrow("回复的评论不存在");
  });

  it("只有作者可以编辑自己的评论", async () => {
    const { owner, student, project } = await makeProject();
    const comment = await createProjectComment(student.id, project.id, {
      content: "旧内容",
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await updateProjectComment(
      student.id,
      comment.id,
      "新内容",
    );
    expect(updated.content).toBe("新内容");
    expect(updated.isEdited).toBe(true);
    await expect(
      updateProjectComment(owner.id, comment.id, "管理员改写"),
    ).rejects.toThrow("只能编辑自己的评论");
  });

  it("作者与管理员可删除，其他成员不可删除", async () => {
    const { owner, student, team, project } = await makeProject();
    const teacher = await makeUser("teacher@example.com");
    await joinTeam(teacher.id, team.inviteCode);
    await updateMemberRole(owner.id, team.id, teacher.id, "teacher");

    const comment = await createProjectComment(student.id, project.id, {
      content: "待删除",
    });
    await expect(deleteProjectComment(teacher.id, comment.id)).rejects.toThrow(
      "只能删除自己的评论",
    );
    await deleteProjectComment(owner.id, comment.id);
    expect((await listProjectComments(owner.id, project.id)).totalCount).toBe(0);
  });

  it("有回复的父评论删除后显示占位，回复仍保留", async () => {
    const { owner, student, project } = await makeProject();
    const root = await createProjectComment(owner.id, project.id, {
      content: "父评论",
    });
    await createProjectComment(student.id, project.id, {
      content: "保留的回复",
      parentId: root.id,
    });

    await deleteProjectComment(owner.id, root.id);
    const page = await listProjectComments(student.id, project.id);
    expect(page.threads).toHaveLength(1);
    expect(page.threads[0].comment.isDeleted).toBe(true);
    expect(page.threads[0].replies[0].content).toBe("保留的回复");
  });

  it("分页加载最新20条顶层评论及全部回复", async () => {
    const { owner, student, project } = await makeProject();
    const roots = [];
    for (let index = 1; index <= 25; index++) {
      roots.push(
        await createProjectComment(owner.id, project.id, {
          content: `评论 ${index}`,
        }),
      );
    }
    await createProjectComment(student.id, project.id, {
      content: "最新评论的回复",
      parentId: roots.at(-1)!.id,
    });

    const first = await listProjectComments(student.id, project.id, {
      limit: 20,
    });
    expect(first.threads).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(first.totalCount).toBe(26);
    expect(first.nextCursor).not.toBeNull();
    expect(first.threads.at(-1)?.replies[0]?.content).toBe("最新评论的回复");

    const second = await listProjectComments(student.id, project.id, {
      limit: 20,
      beforeCreatedAt: first.nextCursor!.createdAt,
      beforeId: first.nextCursor!.id,
    });
    expect(second.threads).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    const ids = new Set(first.threads.map((thread) => thread.comment.id));
    expect(second.threads.some((thread) => ids.has(thread.comment.id))).toBe(false);
  });

  it("拒绝空评论和超过2000字的评论", async () => {
    const { student, project } = await makeProject();
    await expect(
      createProjectComment(student.id, project.id, { content: "   " }),
    ).rejects.toThrow("不能为空");
    await expect(
      createProjectComment(student.id, project.id, { content: "a".repeat(2001) }),
    ).rejects.toThrow("最多 2000 字");
  });
});
