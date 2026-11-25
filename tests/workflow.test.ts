import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createProject } from "@/lib/project";
import {
  createTask,
  listProjectTasks,
  updateTask,
} from "@/lib/task";
import {
  batchUpdateTasks,
  createWorkflowStatus,
  deleteWorkflowStatus,
  getProjectWorkflow,
  reorderWorkflowStatuses,
  setWorkflowTransitions,
} from "@/lib/workflow";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "工作流实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const project = await createProject(owner.id, team.id, { name: "工作流项目" });
  return { owner, student, teacher, project };
}

describe("可配置工作流", () => {
  beforeEach(resetDb);

  it("自动创建默认三状态并回填任务状态", async () => {
    const { owner, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "任务" });
    const rows = await listProjectTasks(owner.id, project.id);
    const workflow = await getProjectWorkflow(owner.id, project.id);

    expect(workflow.statuses.map((status) => status.name)).toEqual([
      "待办",
      "待审核",
      "已完成",
    ]);
    expect(rows[0].statusId).toBeTruthy();
    expect(rows[0].statusId).toBe(task.statusId);
    expect(workflow.statuses.find((status) => status.isDefault)?.category).toBe(
      "todo",
    );
  });

  it("管理员可创建状态、设置 WIP 并重排看板列", async () => {
    const { owner, project } = await scene();
    await getProjectWorkflow(owner.id, project.id);
    const status = await createWorkflowStatus(owner.id, project.id, {
      name: "开发中",
      category: "doing",
      color: "amber",
      wipLimit: 2,
    });
    const before = await getProjectWorkflow(owner.id, project.id);
    const ordered = [status.id, ...before.statuses.map((item) => item.id)];
    await reorderWorkflowStatuses(owner.id, project.id, ordered);
    const after = await getProjectWorkflow(owner.id, project.id);
    expect(after.statuses[0].id).toBe(status.id);
    expect(after.statuses[0].wipLimit).toBe(2);
  });

  it("状态流转规则与 WIP 上限生效", async () => {
    const { owner, project } = await scene();
    const workflow = await getProjectWorkflow(owner.id, project.id);
    const todo = workflow.statuses.find((status) => status.category === "todo")!;
    const done = workflow.statuses.find((status) => status.category === "done")!;
    const review = await createWorkflowStatus(owner.id, project.id, {
      name: "评审中",
      category: "doing",
      color: "blue",
      wipLimit: 1,
    });
    await setWorkflowTransitions(owner.id, project.id, [
      { fromStatusId: todo.id, toStatusId: review.id },
      { fromStatusId: review.id, toStatusId: done.id },
    ]);

    const first = await createTask(owner.id, project.id, { title: "甲" });
    const second = await createTask(owner.id, project.id, { title: "乙" });
    await updateTask(owner.id, first.id, { statusId: review.id });
    await expect(
      updateTask(owner.id, second.id, { statusId: review.id }),
    ).rejects.toThrow("已达到 WIP 上限");
    await expect(
      updateTask(owner.id, second.id, { statusId: done.id }),
    ).rejects.toThrow("该状态流转未被允许");
  });

  it("批量修改状态、优先级和负责人", async () => {
    const { owner, student, project } = await scene();
    const workflow = await getProjectWorkflow(owner.id, project.id);
    const doing = workflow.statuses.find((status) => status.category === "doing")!;
    const a = await createTask(owner.id, project.id, { title: "甲" });
    const b = await createTask(owner.id, project.id, { title: "乙" });

    await batchUpdateTasks(owner.id, project.id, [a.id, b.id], {
      statusId: doing.id,
      priority: "high",
      assigneeIds: [student.id],
    });
    const rows = await listProjectTasks(owner.id, project.id);
    expect(rows.every((row) => row.statusId === doing.id)).toBe(true);
    expect(rows.every((row) => row.priority === "high")).toBe(true);
    expect(rows.every((row) => row.assigneeIds.includes(student.id))).toBe(true);
  });

  it("仅管理员可配置状态，默认状态不可删除", async () => {
    const { owner, student, project } = await scene();
    const workflow = await getProjectWorkflow(owner.id, project.id);
    await expect(
      createWorkflowStatus(student.id, project.id, {
        name: "越权状态",
        category: "doing",
        color: "blue",
      }),
    ).rejects.toThrow("没有权限");
    await expect(
      deleteWorkflowStatus(owner.id, workflow.statuses[0].id),
    ).rejects.toThrow("默认状态不可删除");
  });
});
