import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/project";
import {
  createRelease,
  createTaskWorkLog,
  deleteRelease,
  deleteTaskWorkLog,
  getProjectPlanning,
  getTaskWorkLogs,
  saveSprintCapacities,
  updateRelease,
} from "@/lib/planning";
import { createSprint } from "@/lib/sprint";
import { createTask, updateTask } from "@/lib/task";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createUser } from "@/lib/user";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({
    email,
    password: "password123",
    name: email.split("@")[0],
  });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "规划实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const project = await createProject(owner.id, team.id, {
    name: "规划项目",
    startDate: "2026-11-01",
    endDate: "2026-12-31",
  });
  return { owner, team, student, teacher, project };
}

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

describe("项目规划", () => {
  beforeEach(resetDb);

  it("聚合 Release、工时明细与成员容量", async () => {
    const { owner, student, project } = await scene();
    const release = await createRelease(owner.id, project.id, {
      name: "v1.0",
      status: "active",
      startDate: "2026-11-01",
      targetDate: "2026-11-30",
    });
    const sprint = await createSprint(owner.id, project.id, {
      name: "Sprint 1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      capacity: 20,
    });
    await saveSprintCapacities(owner.id, project.id, sprint.id, {
      [owner.id]: 12,
      [student.id]: 20,
    });
    const task = await createTask(owner.id, project.id, {
      title: "规划任务",
      sprintId: sprint.id,
      releaseId: release.id,
      estimate: 5,
      estimatedHours: 10,
      assigneeIds: [student.id],
    });
    await createTaskWorkLog(student.id, {
      taskId: task.id,
      hours: 3.5,
      workDate: todayKey(),
      note: "完成接口",
    });
    await updateTask(student.id, task.id, { status: "done" });

    const planning = await getProjectPlanning(owner.id, project.id);
    expect(planning).not.toBeNull();
    expect(planning?.summary).toEqual(
      expect.objectContaining({
        taskCount: 1,
        doneTaskCount: 1,
        totalPoints: 5,
        completedPoints: 5,
        estimatedHours: 10,
        actualHours: 3.5,
        releaseCount: 1,
      }),
    );
    expect(planning?.releases[0]).toEqual(
      expect.objectContaining({
        name: "v1.0",
        taskCount: 1,
        doneTaskCount: 1,
        estimateTotal: 5,
        estimatedHours: 10,
        actualHours: 3.5,
      }),
    );
    expect(planning?.sprintCapacities[0]).toEqual(
      expect.objectContaining({
        availableHours: 32,
        estimatedHours: 10,
        actualHours: 3.5,
      }),
    );
    expect(planning?.workLogs[0]).toEqual(
      expect.objectContaining({
        taskId: task.id,
        hours: 3.5,
        note: "完成接口",
      }),
    );
  });

  it("工时只能由管理员/学生记录，删除遵守本人或管理员规则", async () => {
    const { owner, student, teacher, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "工时权限",
      assigneeIds: [student.id],
    });
    const studentLog = await createTaskWorkLog(student.id, {
      taskId: task.id,
      hours: 2,
      workDate: todayKey(),
    });
    const ownerLog = await createTaskWorkLog(owner.id, {
      taskId: task.id,
      hours: 1,
      workDate: todayKey(),
    });

    await expect(
      createTaskWorkLog(teacher.id, {
        taskId: task.id,
        hours: 1,
        workDate: todayKey(),
      }),
    ).rejects.toThrow("没有权限");
    await expect(
      deleteTaskWorkLog(student.id, ownerLog.id),
    ).rejects.toThrow("只能删除自己的工时记录");

    await deleteTaskWorkLog(student.id, studentLog.id);
    await deleteTaskWorkLog(owner.id, ownerLog.id);
    const logs = await getTaskWorkLogs(student.id, task.id);
    expect(logs.logs).toHaveLength(0);
  });

  it("Release 可更新状态，删除后任务保留并解除版本", async () => {
    const { owner, project } = await scene();
    const release = await createRelease(owner.id, project.id, {
      name: "v2.0",
      startDate: "2026-11-01",
      targetDate: "2026-11-20",
    });
    const updated = await updateRelease(owner.id, release.id, {
      status: "released",
    });
    expect(updated.status).toBe("released");
    expect(updated.releaseDate).toBe(todayKey());

    const task = await createTask(owner.id, project.id, {
      title: "挂版本任务",
      releaseId: release.id,
    });
    const planning = await getProjectPlanning(owner.id, project.id);
    expect(planning?.tasks.find((item) => item.id === task.id)?.releaseId).toBe(
      release.id,
    );
    await deleteRelease(owner.id, release.id);
    const afterDelete = await getProjectPlanning(owner.id, project.id);
    expect(
      afterDelete?.tasks.find((item) => item.id === task.id)?.releaseId,
    ).toBeNull();
  });

  it("任务不能挂到其他项目的 Release", async () => {
    const { owner, team, project } = await scene();
    const other = await createProject(owner.id, team.id, { name: "其他项目" });
    const release = await createRelease(owner.id, other.id, {
      name: "外部版本",
    });
    await expect(
      createTask(owner.id, project.id, {
        title: "跨项目版本",
        releaseId: release.id,
      }),
    ).rejects.toThrow("版本不属于该项目");
  });
});
