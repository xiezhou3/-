import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/project";
import { addTaskAttachment, createTask } from "@/lib/task";
import {
  approveTaskReview,
  countPendingTaskReviewsForAdmin,
  listPendingTaskReviewsForAdmin,
  rejectTaskReview,
  submitTaskForReview,
} from "@/lib/task-review";
import { createTeam, joinTeam } from "@/lib/team";
import { createUser } from "@/lib/user";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "审核团队");
  const student = await makeUser("student@example.com");
  const outsider = await makeUser("outsider@example.com");
  await joinTeam(student.id, team.inviteCode);
  const project = await createProject(owner.id, team.id, { name: "审核项目" });
  return { owner, student, outsider, project };
}

describe("task review", () => {
  beforeEach(resetDb);

  it("任务负责人可添加文件链接，非负责人不可添加", async () => {
    const { owner, student, outsider, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "提交报告",
      assigneeIds: [student.id],
    });
    await addTaskAttachment(student.id, task.id, {
      name: "实验报告",
      url: "https://example.com/report",
    });
    await expect(
      addTaskAttachment(outsider.id, task.id, {
        name: "越权",
        url: "https://example.com/no",
      }),
    ).rejects.toThrow("没有权限");
  });

  it("提交审核前必须有文件链接，提交后进入待审核并出现在管理员邮箱", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "提交材料",
      assigneeIds: [student.id],
    });
    await expect(submitTaskForReview(student.id, task.id)).rejects.toThrow(
      "请先添加至少一个文件链接",
    );

    await addTaskAttachment(student.id, task.id, {
      name: "材料",
      url: "https://example.com/material",
    });
    await submitTaskForReview(student.id, task.id);

    const reviews = await listPendingTaskReviewsForAdmin(owner.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].taskTitle).toBe("提交材料");
    expect(await countPendingTaskReviewsForAdmin(owner.id)).toBe(1);
  });

  it("管理员通过审核后任务自动完成", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "通过审核",
      assigneeIds: [student.id],
    });
    await addTaskAttachment(student.id, task.id, {
      name: "交付",
      url: "https://example.com/delivery",
    });
    await submitTaskForReview(student.id, task.id);
    const [review] = await listPendingTaskReviewsForAdmin(owner.id);

    const done = await approveTaskReview(owner.id, review.id);
    expect(done.status).toBe("done");
    expect(await countPendingTaskReviewsForAdmin(owner.id)).toBe(0);
  });

  it("管理员退回后任务回到待办，修改后可再次提交", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "退回修改",
      assigneeIds: [student.id],
    });
    await addTaskAttachment(student.id, task.id, {
      name: "初稿",
      url: "https://example.com/draft",
    });
    await submitTaskForReview(student.id, task.id);
    const [review] = await listPendingTaskReviewsForAdmin(owner.id);

    await rejectTaskReview(owner.id, review.id, "请补充测试结果");
    await submitTaskForReview(student.id, task.id);
    const reviews = await listPendingTaskReviewsForAdmin(owner.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe(review.id);
  });

  it("非管理员不能通过或退回审核", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "权限",
      assigneeIds: [student.id],
    });
    await addTaskAttachment(student.id, task.id, {
      name: "材料",
      url: "https://example.com/material",
    });
    await submitTaskForReview(student.id, task.id);
    const [review] = await listPendingTaskReviewsForAdmin(owner.id);

    await expect(approveTaskReview(student.id, review.id)).rejects.toThrow("没有权限");
    await expect(rejectTaskReview(student.id, review.id, "")).rejects.toThrow(
      "没有权限",
    );
  });
});
