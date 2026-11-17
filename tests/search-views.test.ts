import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { createProject } from "@/lib/project";
import { createRelease } from "@/lib/planning";
import {
  listRecentVisits,
  recordRecentVisit,
} from "@/lib/recent-visits";
import {
  searchGlobally,
  taskNumberFromQuery,
} from "@/lib/search";
import { createTask, ensureProjectTaskNumbers } from "@/lib/task";
import { createTeam, joinTeam } from "@/lib/team";
import { createUser } from "@/lib/user";
import {
  createSavedTaskView,
  deleteSavedTaskView,
  listSavedTaskViews,
} from "@/lib/views";
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
  const team = await createTeam(owner.id, "搜索实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const outsider = await makeUser("outsider@example.com");
  const project = await createProject(owner.id, team.id, {
    name: "全局搜索项目",
    description: "验证搜索和视图",
  });
  return { owner, team, student, outsider, project };
}

describe("全局搜索与保存视图", () => {
  beforeEach(resetDb);

  it("任务自动获得项目内稳定编号，并可回填旧任务", async () => {
    const { owner, project } = await scene();
    const first = await createTask(owner.id, project.id, { title: "第一项" });
    const second = await createTask(owner.id, project.id, { title: "第二项" });
    const third = await createTask(owner.id, project.id, { title: "第三项" });
    expect([first.taskNumber, second.taskNumber, third.taskNumber]).toEqual([
      1, 2, 3,
    ]);
    await db.delete(tasks).where(eq(tasks.id, third.id));
    const fourth = await createTask(owner.id, project.id, { title: "第四项" });
    expect(fourth.taskNumber).toBe(4);

    await db
      .update(tasks)
      .set({ taskNumber: null })
      .where(eq(tasks.projectId, project.id));
    await ensureProjectTaskNumbers(project.id);
    const rows = await db.select().from(tasks).where(eq(tasks.projectId, project.id));
    expect(rows.map((row) => row.taskNumber).sort()).toEqual([5, 6, 7]);
  });

  it("按任务编号、标题、项目和 Release 全局搜索且不越权", async () => {
    const { owner, student, outsider, project } = await scene();
    await createRelease(owner.id, project.id, {
      name: "v1.0 全局搜索版",
      description: "搜索版本",
      targetDate: "2026-12-01",
    });
    const task = await createTask(owner.id, project.id, {
      title: "实现全局搜索",
      description: "支持任务编号检索",
    });

    expect(taskNumberFromQuery("#1")).toBe(1);
    expect(taskNumberFromQuery("任务 1")).toBeNull();
    const byNumber = await searchGlobally(student.id, `#${task.taskNumber}`);
    expect(byNumber.tasks.map((item) => item.id)).toContain(task.id);
    expect(byNumber.taskNumber).toBe(task.taskNumber);

    const byTitle = await searchGlobally(student.id, "全局搜索");
    expect(byTitle.tasks.map((item) => item.id)).toContain(task.id);
    expect(byTitle.projects[0].name).toBe("全局搜索项目");
    expect(byTitle.releases[0].name).toBe("v1.0 全局搜索版");

    const hidden = await searchGlobally(outsider.id, "全局搜索");
    expect(hidden.tasks).toHaveLength(0);
    expect(hidden.projects).toHaveLength(0);
  });

  it("保存视图按用户隔离，可删除", async () => {
    const { owner, student, project } = await scene();
    const view = await createSavedTaskView(owner.id, project.id, {
      name: "我的高优先级",
      filters: "priority=high&sprint=all",
    });
    const ownerViews = await listSavedTaskViews(owner.id, project.id);
    expect(ownerViews).toEqual([
      expect.objectContaining({
        id: view.id,
        name: "我的高优先级",
      }),
    ]);
    expect(await listSavedTaskViews(student.id, project.id)).toHaveLength(0);
    await expect(deleteSavedTaskView(student.id, view.id)).rejects.toThrow(
      "没有权限",
    );
    await deleteSavedTaskView(owner.id, view.id);
    expect(await listSavedTaskViews(owner.id, project.id)).toHaveLength(0);
  });

  it("最近访问同一路径会更新时间而不是重复插入", async () => {
    const { owner, project } = await scene();
    const task = await createTask(owner.id, project.id, { title: "最近任务" });
    const path = `/projects/${project.id}?task=${task.id}&sprint=all`;
    await recordRecentVisit(owner.id, {
      projectId: project.id,
      taskId: task.id,
      label: "任务 #1 · 最近任务",
      path,
    });
    await recordRecentVisit(owner.id, {
      projectId: project.id,
      taskId: task.id,
      label: "任务 #1 · 最近任务（更新）",
      path,
    });
    const visits = await listRecentVisits(owner.id);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toEqual(
      expect.objectContaining({
        taskId: task.id,
        label: "任务 #1 · 最近任务（更新）",
        path,
      }),
    );
  });
});
