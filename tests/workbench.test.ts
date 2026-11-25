import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/project";
import { createProjectFileLink } from "@/lib/project-file-service";
import { addTaskAttachment, createTask } from "@/lib/task";
import { createTaskComment } from "@/lib/task-collaboration";
import { submitTaskForReview } from "@/lib/task-review";
import { createTeam, joinTeam } from "@/lib/team";
import { createUser } from "@/lib/user";
import {
  addDaysToDateKey,
  getAppToday,
  getMyWorkbench,
} from "@/lib/workbench";
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
  const team = await createTeam(owner.id, "工作台实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const project = await createProject(owner.id, team.id, {
    name: "个人工作台项目",
  });
  return { owner, team, student, project };
}

describe("personal workbench", () => {
  beforeEach(resetDb);

  it("聚合我的任务、今日待办、逾期、审核、活动与项目负载", async () => {
    const { owner, student, project } = await scene();
    const today = getAppToday();
    const yesterday = addDaysToDateKey(today, -1);
    const later = addDaysToDateKey(today, 3);

    const todayTask = await createTask(owner.id, project.id, {
      title: "今天交付",
      assigneeIds: [student.id],
      dueDate: today,
      priority: "high",
    });
    const overdueTask = await createTask(owner.id, project.id, {
      title: "补交材料",
      assigneeIds: [student.id],
      dueDate: yesterday,
    });
    const futureTask = await createTask(owner.id, project.id, {
      title: "准备下次汇报",
      assigneeIds: [student.id],
      dueDate: later,
    });
    await createTask(owner.id, project.id, {
      title: "无截止任务",
      assigneeIds: [student.id],
    });
    const reviewTask = await createTask(owner.id, project.id, {
      title: "等待审核",
      assigneeIds: [student.id],
      dueDate: later,
    });
    await createTask(owner.id, project.id, {
      title: "已经完成",
      assigneeIds: [student.id],
      dueDate: today,
      status: "done",
    });
    const otherTask = await createTask(owner.id, project.id, {
      title: "不属于学生",
      assigneeIds: [owner.id],
    });

    const file = await createProjectFileLink(student.id, project.id, {
      name: "审核材料",
      url: "https://example.com/workbench-review",
      kind: "document",
    });
    await addTaskAttachment(student.id, reviewTask.id, {
      projectFileId: file.id,
    });
    await submitTaskForReview(student.id, reviewTask.id);
    await createTaskComment(owner.id, overdueTask.id, {
      content: "@student 请补充说明",
      mentionIds: [student.id],
    });

    const data = await getMyWorkbench(student.id);

    expect(data.summary.assignedOpen).toBe(5);
    expect(data.todayTasks.map((task) => task.id)).toContain(todayTask.id);
    expect(data.overdueTasks.map((task) => task.id)).toContain(overdueTask.id);
    expect(data.tasks.map((task) => task.id)).not.toContain(otherTask.id);
    expect(data.tasks.map((task) => task.id)).toContain(futureTask.id);
    expect(data.summary.completedLast7Days).toBe(1);
    expect(data.submittedReviews).toHaveLength(1);
    expect(data.submittedReviews[0].taskId).toBe(reviewTask.id);
    expect(data.reviewQueue).toHaveLength(0);
    expect(data.summary.reviewAttention).toBe(1);
    expect(data.teams).toEqual([
      expect.objectContaining({ name: "工作台实验室", role: "student" }),
    ]);
    expect(data.projectLoad[0]).toEqual(
      expect.objectContaining({
        projectName: "个人工作台项目",
        total: 5,
        overdue: 1,
        today: 1,
      }),
    );
    expect(
      data.recentActivity.some(
        (item) =>
          item.type === "task_mention" &&
          item.taskId === overdueTask.id &&
          item.actorId === owner.id,
      ),
    ).toBe(true);
  });

  it("项目管理员能在工作台看到待自己审核的任务", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "管理员待审",
      assigneeIds: [student.id],
    });
    const file = await createProjectFileLink(student.id, project.id, {
      name: "成果",
      url: "https://example.com/workbench-queue",
      kind: "document",
    });
    await addTaskAttachment(student.id, task.id, { projectFileId: file.id });
    await submitTaskForReview(student.id, task.id);

    const data = await getMyWorkbench(owner.id);

    expect(data.summary.reviewQueue).toBe(1);
    expect(data.summary.reviewAttention).toBe(1);
    expect(data.reviewQueue[0]).toEqual(
      expect.objectContaining({
        taskId: task.id,
        taskTitle: "管理员待审",
        projectName: "个人工作台项目",
        submittedById: student.id,
      }),
    );
  });
});
