import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createProject } from "@/lib/project";
import { createTask, listProjectTasks, updateTask } from "@/lib/task";
import {
  assignTasksToSprint,
  closeSprint,
  createSprint,
  listProjectSprints,
  startSprint,
  updateSprint,
} from "@/lib/sprint";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "迭代实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const outsider = await makeUser("outsider@example.com");
  const project = await createProject(owner.id, team.id, { name: "秋季迭代" });
  return { owner, team, student, teacher, outsider, project };
}

function sprintInput(name = "Sprint 1") {
  return {
    name,
    goal: "完成核心闭环",
    startDate: "2026-11-01",
    endDate: "2026-11-14",
    capacity: 20,
  };
}

describe("Sprint 管理", () => {
  beforeEach(resetDb);

  it("管理员和学生可创建迭代，教师与非成员被拒", async () => {
    const { owner, student, teacher, outsider, project } = await scene();
    const studentSprint = await createSprint(student.id, project.id, sprintInput());
    expect(studentSprint.status).toBe("planned");
    expect(studentSprint.capacity).toBe(20);

    await expect(
      createSprint(teacher.id, project.id, sprintInput("教师迭代")),
    ).rejects.toThrow("没有权限");
    await expect(
      createSprint(outsider.id, project.id, sprintInput("外部迭代")),
    ).rejects.toThrow("没有权限");

    const ownerSprint = await createSprint(owner.id, project.id, sprintInput("Sprint 2"));
    const list = await listProjectSprints(student.id, project.id);
    expect(list.map((sprint) => sprint.id)).toEqual(
      expect.arrayContaining([studentSprint.id, ownerSprint.id]),
    );
  });

  it("校验结束日期和容量", async () => {
    const { owner, project } = await scene();
    await expect(
      createSprint(owner.id, project.id, {
        ...sprintInput(),
        endDate: "2026-10-31",
      }),
    ).rejects.toThrow("结束日期不能早于开始日期");
    await expect(
      createSprint(owner.id, project.id, {
        ...sprintInput(),
        capacity: -1,
      }),
    ).rejects.toThrow("容量必须是非负整数");
  });

  it("计划中可全改，进行中只能改目标和容量，关闭后只读", async () => {
    const { student, project } = await scene();
    const sprint = await createSprint(student.id, project.id, sprintInput());
    const renamed = await updateSprint(student.id, sprint.id, {
      name: "Sprint 改名",
      startDate: "2026-11-02",
      endDate: "2026-11-15",
      capacity: 24,
      goal: "新目标",
    });
    expect(renamed.name).toBe("Sprint 改名");
    expect(renamed.capacity).toBe(24);

    await startSprint(student.id, sprint.id);
    const active = await updateSprint(student.id, sprint.id, {
      name: renamed.name,
      startDate: renamed.startDate,
      endDate: renamed.endDate,
      capacity: 30,
      goal: "执行中目标",
    });
    expect(active.capacity).toBe(30);
    await expect(
      updateSprint(student.id, sprint.id, { name: "不应成功" }),
    ).rejects.toThrow("进行中的迭代只能修改目标和容量");
  });

  it("同项目最多一个进行中迭代", async () => {
    const { owner, project } = await scene();
    const first = await createSprint(owner.id, project.id, sprintInput("Sprint 1"));
    const second = await createSprint(owner.id, project.id, sprintInput("Sprint 2"));
    await startSprint(owner.id, first.id);
    await expect(startSprint(owner.id, second.id)).rejects.toThrow(
      "该项目已有进行中的迭代",
    );
    await expect(startSprint(owner.id, first.id)).rejects.toThrow(
      "只有计划中的迭代可以启动",
    );
  });

  it("任务可规划入 Sprint，并统计故事点与未估算任务", async () => {
    const { student, project } = await scene();
    const sprint = await createSprint(student.id, project.id, sprintInput());
    const assigned = await createTask(student.id, project.id, {
      title: "已估算",
      estimate: 5,
      sprintId: sprint.id,
    });
    const unassigned = await createTask(student.id, project.id, {
      title: "未估算",
    });
    expect(assigned.sprintId).toBe(sprint.id);
    expect(assigned.estimate).toBe(5);

    await assignTasksToSprint(student.id, project.id, [unassigned.id], sprint.id);
    const [summary] = await listProjectSprints(student.id, project.id);
    expect(summary.taskCount).toBe(2);
    expect(summary.estimateTotal).toBe(5);
    expect(summary.unestimatedTaskCount).toBe(1);
  });

  it("任务不能挂到其他项目的 Sprint，故事点必须非负", async () => {
    const { owner, team, student, project } = await scene();
    const other = await createProject(owner.id, team.id, { name: "另一个项目" });
    const foreign = await createSprint(owner.id, other.id, sprintInput("外部 Sprint"));
    await expect(
      createTask(student.id, project.id, {
        title: "跨项目任务",
        sprintId: foreign.id,
      }),
    ).rejects.toThrow("迭代不属于该项目");
    await expect(
      createTask(student.id, project.id, {
        title: "负数故事点",
        estimate: -1,
      }),
    ).rejects.toThrow("故事点必须是非负整数");
  });

  it("关闭进行中迭代时未完成任务可退回 Backlog", async () => {
    const { student, project } = await scene();
    const sprint = await createSprint(student.id, project.id, sprintInput());
    const done = await createTask(student.id, project.id, {
      title: "已完成",
      sprintId: sprint.id,
      estimate: 3,
    });
    const unfinished = await createTask(student.id, project.id, {
      title: "未完成",
      sprintId: sprint.id,
      estimate: 5,
    });
    await updateTask(student.id, done.id, { status: "done" });
    await startSprint(student.id, sprint.id);

    const result = await closeSprint(student.id, sprint.id, { type: "backlog" });
    expect(result.movedTaskCount).toBe(1);

    const rows = await listProjectTasks(student.id, project.id);
    expect(rows.find((task) => task.id === done.id)?.sprintId).toBe(sprint.id);
    expect(rows.find((task) => task.id === unfinished.id)?.sprintId).toBeNull();
  });

  it("关闭进行中迭代时未完成任务可顺延到计划迭代", async () => {
    const { owner, project } = await scene();
    const active = await createSprint(owner.id, project.id, sprintInput("Sprint 1"));
    const next = await createSprint(owner.id, project.id, {
      ...sprintInput("Sprint 2"),
      startDate: "2026-11-15",
      endDate: "2026-11-28",
    });
    const task = await createTask(owner.id, project.id, {
      title: "顺延任务",
      sprintId: active.id,
    });
    await startSprint(owner.id, active.id);
    await closeSprint(owner.id, active.id, {
      type: "sprint",
      targetSprintId: next.id,
    });
    const rows = await listProjectTasks(owner.id, project.id);
    expect(rows.find((row) => row.id === task.id)?.sprintId).toBe(next.id);
  });

  it("已关闭迭代中的任务不能重新规划", async () => {
    const { owner, student, project } = await scene();
    const sprint = await createSprint(owner.id, project.id, sprintInput());
    const task = await createTask(owner.id, project.id, {
      title: "历史任务",
      sprintId: sprint.id,
    });
    await updateTask(owner.id, task.id, { status: "done" });
    await startSprint(owner.id, sprint.id);
    await closeSprint(owner.id, sprint.id, { type: "backlog" });
    await expect(
      assignTasksToSprint(student.id, project.id, [task.id], null),
    ).rejects.toThrow("已关闭迭代中的任务不能重新规划");
  });
});
