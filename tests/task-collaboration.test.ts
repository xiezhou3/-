import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createProject } from "@/lib/project";
import { createTask, updateTask } from "@/lib/task";
import { getProjectWorkflow } from "@/lib/workflow";
import { createProjectFileLink } from "@/lib/project-file-service";
import {
  createTaskComment,
  deleteTaskComment,
  listTaskCollaboration,
  setTaskWatching,
  taskCommentSummary,
  updateTaskComment,
} from "@/lib/task-collaboration";
import { listMyNotifications } from "@/lib/notification";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "协作实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const project = await createProject(owner.id, team.id, { name: "协作项目" });
  const task = await createTask(owner.id, project.id, { title: "协作任务" });
  return { owner, team, student, teacher, project, task };
}

describe("任务评论与关注", () => {
  beforeEach(resetDb);

  it("评论可提及成员、自动关注并产生站内通知", async () => {
    const { owner, student, project, task } = await scene();
    await createTaskComment(student.id, task.id, {
      content: "@owner 请确认方案",
      mentionIds: [owner.id],
    });
    const data = await listTaskCollaboration(owner.id, task.id);
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].content).toContain("请确认方案");
    expect(data.isWatching).toBe(true);

    const summary = await taskCommentSummary(owner.id, project.id, [task.id]);
    expect(summary.counts.get(task.id)).toBe(1);
    expect(summary.mentions.has(task.id)).toBe(true);

    const notifications = await listMyNotifications(owner.id);
    expect(notifications[0].type).toBe("task_mention");
    expect(notifications[0].taskId).toBe(task.id);
  });

  it("回复与附件可回读，作者可编辑和软删除", async () => {
    const { owner, student, project, task } = await scene();
    const file = await createProjectFileLink(owner.id, project.id, {
      name: "方案",
      url: "https://example.com/design",
      kind: "document",
    });
    const root = await createTaskComment(owner.id, task.id, {
      content: "根评论",
      projectFileIds: [file.id],
    });
    const reply = await createTaskComment(student.id, task.id, {
      content: "回复内容",
      parentId: root.id,
    });
    await updateTaskComment(student.id, reply.id, "修改后的回复");
    let data = await listTaskCollaboration(owner.id, task.id);
    expect(data.comments.find((item) => item.id === root.id)?.attachments[0].name).toBe("方案");
    expect(data.comments.find((item) => item.id === reply.id)?.content).toBe("修改后的回复");

    await deleteTaskComment(student.id, reply.id);
    data = await listTaskCollaboration(owner.id, task.id);
    expect(data.comments.find((item) => item.id === reply.id)?.deletedAt).toBeTruthy();
  });

  it("其他成员不能编辑评论，删除评论后不再计入任务卡评论数", async () => {
    const { owner, student, project, task } = await scene();
    const comment = await createTaskComment(student.id, task.id, {
      content: "学生评论",
    });
    await expect(
      updateTaskComment(owner.id, comment.id, "管理员篡改"),
    ).rejects.toThrow("只能编辑自己的评论");
    await deleteTaskComment(owner.id, comment.id);
    const summary = await taskCommentSummary(owner.id, project.id, [task.id]);
    expect(summary.counts.get(task.id) ?? 0).toBe(0);
  });

  it("关注任务后状态变化会生成通知", async () => {
    const { owner, student, project, task } = await scene();
    const workflow = await getProjectWorkflow(owner.id, project.id);
    const doing = workflow.statuses.find((status) => status.category === "doing")!;
    await setTaskWatching(student.id, task.id, true);
    await updateTask(owner.id, task.id, { statusId: doing.id });

    const notifications = await listMyNotifications(student.id);
    expect(
      notifications.some(
        (item) => item.type === "task_status" && item.taskId === task.id,
      ),
    ).toBe(true);
  });
});
