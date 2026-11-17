import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam } from "@/lib/team";
import { createProject } from "@/lib/project";
import {
  createTask,
  deleteTask,
  getTaskDetail,
  updateTask,
} from "@/lib/task";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "工作项实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const project = await createProject(owner.id, team.id, { name: "工作项项目" });
  return { owner, team, student, project };
}

describe("工作项类型与层级", () => {
  beforeEach(resetDb);

  it("默认类型为 Task，可创建四种工作项", async () => {
    const { student, project } = await scene();
    const epic = await createTask(student.id, project.id, {
      title: "Epic",
      workItemType: "epic",
    });
    const story = await createTask(student.id, project.id, {
      title: "Story",
      workItemType: "story",
      parentWorkItemId: epic.id,
    });
    const task = await createTask(student.id, project.id, {
      title: "Task",
      workItemType: "task",
      parentWorkItemId: story.id,
    });
    const bug = await createTask(student.id, project.id, {
      title: "Bug",
      workItemType: "bug",
      parentWorkItemId: story.id,
    });
    const defaultTask = await createTask(student.id, project.id, {
      title: "默认 Task",
    });

    expect(epic.workItemType).toBe("epic");
    expect(story.parentWorkItemId).toBe(epic.id);
    expect(task.parentWorkItemId).toBe(story.id);
    expect(bug.parentWorkItemId).toBe(story.id);
    expect(defaultTask.workItemType).toBe("task");
  });

  it("拒绝不符合标准三层的父项", async () => {
    const { owner, project } = await scene();
    const epic = await createTask(owner.id, project.id, {
      title: "Epic",
      workItemType: "epic",
    });
    const story = await createTask(owner.id, project.id, {
      title: "Story",
      workItemType: "story",
      parentWorkItemId: epic.id,
    });
    const task = await createTask(owner.id, project.id, {
      title: "Task",
      workItemType: "task",
      parentWorkItemId: story.id,
    });

    await expect(
      createTask(owner.id, project.id, {
        title: "非法 Epic",
        workItemType: "epic",
        parentWorkItemId: epic.id,
      }),
    ).rejects.toThrow("Epic 不能设置父工作项");
    await expect(
      createTask(owner.id, project.id, {
        title: "非法 Story",
        workItemType: "story",
        parentWorkItemId: story.id,
      }),
    ).rejects.toThrow("Story 的父工作项必须是 Epic");
    await expect(
      createTask(owner.id, project.id, {
        title: "非法 Task",
        workItemType: "task",
        parentWorkItemId: epic.id,
      }),
    ).rejects.toThrow("Task 的父工作项必须是 Story");
    await expect(
      createTask(owner.id, project.id, {
        title: "非法父子",
        workItemType: "task",
        parentWorkItemId: task.id,
      }),
    ).rejects.toThrow("Task 的父工作项必须是 Story");
  });

  it("父项必须属于同项目且不能指向自身", async () => {
    const { owner, team, project } = await scene();
    const other = await createProject(owner.id, team.id, { name: "其他项目" });
    const foreignEpic = await createTask(owner.id, other.id, {
      title: "外部 Epic",
      workItemType: "epic",
    });
    await expect(
      createTask(owner.id, project.id, {
        title: "跨项目 Story",
        workItemType: "story",
        parentWorkItemId: foreignEpic.id,
      }),
    ).rejects.toThrow("父工作项不属于该项目");

    const story = await createTask(owner.id, project.id, {
      title: "Story",
      workItemType: "story",
    });
    await expect(
      updateTask(owner.id, story.id, {
        parentWorkItemId: story.id,
      }),
    ).rejects.toThrow("工作项不能以自身为父项");
  });

  it("修改类型时校验现有父项和下级工作项", async () => {
    const { owner, project } = await scene();
    const epic = await createTask(owner.id, project.id, {
      title: "Epic",
      workItemType: "epic",
    });
    await createTask(owner.id, project.id, {
      title: "Story",
      workItemType: "story",
      parentWorkItemId: epic.id,
    });
    await expect(
      updateTask(owner.id, epic.id, { workItemType: "story" }),
    ).rejects.toThrow("现有下级工作项与目标类型不兼容");

    const standalone = await createTask(owner.id, project.id, {
      title: "独立 Story",
      workItemType: "story",
    });
    const updated = await updateTask(owner.id, standalone.id, {
      workItemType: "bug",
    });
    expect(updated.workItemType).toBe("bug");
    expect(updated.parentWorkItemId).toBeNull();
  });

  it("删除父工作项后下级保留且父级清空", async () => {
    const { owner, project } = await scene();
    const epic = await createTask(owner.id, project.id, {
      title: "Epic",
      workItemType: "epic",
    });
    const story = await createTask(owner.id, project.id, {
      title: "Story",
      workItemType: "story",
      parentWorkItemId: epic.id,
    });
    await deleteTask(owner.id, epic.id);
    const detail = await getTaskDetail(owner.id, story.id);
    expect(detail.parentWorkItemId).toBeNull();
  });
});
