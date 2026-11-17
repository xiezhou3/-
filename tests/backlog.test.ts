import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createProject } from "@/lib/project";
import { createTask } from "@/lib/task";
import {
  closeSprint,
  createSprint,
  startSprint,
} from "@/lib/sprint";
import {
  createBacklogTask,
  listBacklogData,
  reorderBacklog,
} from "@/lib/backlog";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "Backlog 实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const outsider = await makeUser("outsider@example.com");
  const project = await createProject(owner.id, team.id, { name: "Backlog 项目" });
  return { owner, team, student, teacher, outsider, project };
}

function sprintInput(name: string, startDate: string, endDate: string) {
  return { name, startDate, endDate, capacity: 30, goal: name };
}

describe("Backlog 工作区", () => {
  beforeEach(resetDb);

  it("默认选择 active Sprint，没有 active 时选择最早 planned Sprint", async () => {
    const { owner, project } = await scene();
    const late = await createSprint(
      owner.id,
      project.id,
      sprintInput("后序迭代", "2026-12-01", "2026-12-14"),
    );
    const early = await createSprint(
      owner.id,
      project.id,
      sprintInput("前序迭代", "2026-11-01", "2026-11-14"),
    );

    let data = await listBacklogData(owner.id, project.id);
    expect(data.selectedSprint?.id).toBe(early.id);

    await startSprint(owner.id, late.id);
    data = await listBacklogData(owner.id, project.id);
    expect(data.selectedSprint?.id).toBe(late.id);
  });

  it("快速创建任务追加到 Backlog 底部", async () => {
    const { student, project } = await scene();
    const first = await createBacklogTask(student.id, project.id, "第一项");
    const second = await createBacklogTask(student.id, project.id, "第二项");

    const data = await listBacklogData(student.id, project.id);
    expect(data.backlogTasks.map((task) => task.title)).toEqual(["第一项", "第二项"]);
    expect(second.backlogRank).toBeGreaterThan(first.backlogRank);
  });

  it("拖拽重排后 backlogRank 与读取顺序持久化", async () => {
    const { student, project } = await scene();
    const a = await createTask(student.id, project.id, { title: "A" });
    const b = await createTask(student.id, project.id, { title: "B" });
    const c = await createTask(student.id, project.id, { title: "C" });
    const sprint = await createSprint(
      student.id,
      project.id,
      sprintInput("Sprint 1", "2026-11-01", "2026-11-14"),
    );

    await reorderBacklog(
      student.id,
      project.id,
      sprint.id,
      [c.id, a.id, b.id],
      [],
    );
    const data = await listBacklogData(student.id, project.id, sprint.id);
    expect(data.backlogTasks.map((task) => task.title)).toEqual(["C", "A", "B"]);
    expect(data.backlogTasks[0].backlogRank).toBe(1024);
    expect(data.backlogTasks[1].backlogRank).toBe(2048);
    expect(data.backlogTasks[2].backlogRank).toBe(3072);
  });

  it("任务可在 Backlog 与 Sprint 之间双向移动", async () => {
    const { student, project } = await scene();
    const sprint = await createSprint(
      student.id,
      project.id,
      sprintInput("Sprint 1", "2026-11-01", "2026-11-14"),
    );
    const backlogTask = await createTask(student.id, project.id, { title: "待规划" });
    const sprintTask = await createTask(student.id, project.id, {
      title: "已规划",
      sprintId: sprint.id,
    });

    await reorderBacklog(
      student.id,
      project.id,
      sprint.id,
      [sprintTask.id],
      [backlogTask.id],
    );
    let data = await listBacklogData(student.id, project.id, sprint.id);
    expect(data.backlogTasks.map((task) => task.id)).toEqual([sprintTask.id]);
    expect(data.sprintTasks.map((task) => task.id)).toEqual([backlogTask.id]);

    await reorderBacklog(
      student.id,
      project.id,
      sprint.id,
      [sprintTask.id, backlogTask.id],
      [],
    );
    data = await listBacklogData(student.id, project.id, sprint.id);
    expect(data.backlogTasks.map((task) => task.id)).toEqual([
      sprintTask.id,
      backlogTask.id,
    ]);
    expect(data.sprintTasks).toHaveLength(0);
  });

  it("教师和非成员不能创建或拖拽", async () => {
    const { owner, teacher, outsider, project } = await scene();
    const sprint = await createSprint(
      owner.id,
      project.id,
      sprintInput("Sprint 1", "2026-11-01", "2026-11-14"),
    );
    await expect(
      createBacklogTask(teacher.id, project.id, "越权"),
    ).rejects.toThrow("没有权限");
    await expect(
      reorderBacklog(outsider.id, project.id, sprint.id, [], []),
    ).rejects.toThrow("没有权限");
  });

  it("不能拖入已关闭 Sprint，也不能混入其他项目任务", async () => {
    const { owner, team, project } = await scene();
    const closed = await createSprint(
      owner.id,
      project.id,
      sprintInput("Closed", "2026-11-01", "2026-11-14"),
    );
    await startSprint(owner.id, closed.id);
    await closeSprint(owner.id, closed.id, { type: "backlog" });
    const task = await createTask(owner.id, project.id, { title: "不可移动" });
    await expect(
      reorderBacklog(owner.id, project.id, closed.id, [], [task.id]),
    ).rejects.toThrow("不能把任务加入已关闭的迭代");

    const other = await createProject(owner.id, team.id, { name: "其他项目" });
    const otherTask = await createTask(owner.id, other.id, { title: "其他任务" });
    const open = await createSprint(
      owner.id,
      project.id,
      sprintInput("Open", "2026-11-15", "2026-11-28"),
    );
    await expect(
      reorderBacklog(owner.id, project.id, open.id, [otherTask.id], []),
    ).rejects.toThrow("Backlog 列表包含无效任务");
  });
});
