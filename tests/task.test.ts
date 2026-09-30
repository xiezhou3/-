import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createProject, createMilestone } from "@/lib/project";
import {
  createTask,
  moveTask,
  updateTask,
  deleteTask,
  listProjectTasks,
} from "@/lib/task";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("owner@example.com");
  const team = await createTeam(owner.id, "东吴实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const outsider = await makeUser("outsider@example.com");
  const project = await createProject(owner.id, team.id, { name: "赤壁演习" });
  return { owner, team, student, teacher, outsider, project };
}

describe("createTask", () => {
  beforeEach(resetDb);

  it("student 可建任务，默认 todo/medium，含负责人与截止日", async () => {
    const { student, project } = await scene();
    const t = await createTask(student.id, project.id, {
      title: "撰写调研问卷",
      assigneeId: student.id,
      dueDate: "2026-10-01",
    });
    expect(t.status).toBe("todo");
    expect(t.priority).toBe("medium");
    expect(t.assigneeId).toBe(student.id);
    expect(t.sortOrder).toBeGreaterThan(0);
  });

  it("可在指定看板列创建 doing 或 done 状态任务", async () => {
    const { student, project } = await scene();
    const doing = await createTask(student.id, project.id, {
      title: "进行中的任务",
      status: "doing",
    });
    const done = await createTask(student.id, project.id, {
      title: "已完成的任务",
      status: "done",
    });
    expect(doing.status).toBe("doing");
    expect(done.status).toBe("done");
  });

  it("teacher 建任务被拒（只读角色）", async () => {
    const { teacher, project } = await scene();
    await expect(
      createTask(teacher.id, project.id, { title: "越权任务" }),
    ).rejects.toThrow("没有权限");
  });

  it("非成员建任务被拒", async () => {
    const { outsider, project } = await scene();
    await expect(
      createTask(outsider.id, project.id, { title: "越权任务" }),
    ).rejects.toThrow("没有权限");
  });

  it("负责人必须是团队成员", async () => {
    const { student, outsider, project } = await scene();
    await expect(
      createTask(student.id, project.id, { title: "任务", assigneeId: outsider.id }),
    ).rejects.toThrow("负责人不是团队成员");
  });

  it("可一次设置多个负责人，列表按选择顺序回读", async () => {
    const { owner, student, teacher, project } = await scene();
    await createTask(owner.id, project.id, {
      title: "多人协作",
      assigneeIds: [student.id, teacher.id],
    });

    const [task] = await listProjectTasks(owner.id, project.id);
    expect(task.assigneeIds).toEqual([student.id, teacher.id]);
    expect(task.assignees.map((item) => item.name)).toEqual(["student", "teacher"]);
    expect(task.assigneeId).toBe(student.id);
  });

  it("里程碑必须属于本项目", async () => {
    const { owner, team, student, project } = await scene();
    const other = await createProject(owner.id, team.id, { name: "另一项目" });
    const m = await createMilestone(owner.id, other.id, { title: "别家节点" });
    await expect(
      createTask(student.id, project.id, { title: "任务", milestoneId: m.id }),
    ).rejects.toThrow("里程碑不属于该项目");
  });
});

describe("updateTask", () => {
  beforeEach(resetDb);

  it("student 可改状态与负责人", async () => {
    const { owner, student, project } = await scene();
    const t = await createTask(student.id, project.id, { title: "任务" });
    const updated = await updateTask(student.id, t.id, {
      status: "doing",
      assigneeId: owner.id,
    });
    expect(updated.status).toBe("doing");
    expect(updated.assigneeId).toBe(owner.id);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(t.updatedAt.getTime());
  });

  it("可替换任务的多个负责人", async () => {
    const { owner, student, teacher, project } = await scene();
    const t = await createTask(owner.id, project.id, {
      title: "多人协作",
      assigneeIds: [student.id],
    });
    await updateTask(owner.id, t.id, {
      assigneeIds: [teacher.id, student.id],
    });
    const [row] = await listProjectTasks(owner.id, project.id);
    expect(row.assigneeIds).toEqual([teacher.id, student.id]);
    expect(row.assigneeId).toBe(teacher.id);
  });

  it("teacher 改任务被拒", async () => {
    const { student, teacher, project } = await scene();
    const t = await createTask(student.id, project.id, { title: "任务" });
    await expect(updateTask(teacher.id, t.id, { status: "done" })).rejects.toThrow(
      "没有权限",
    );
  });

  it("任务不存在抛可展示错误", async () => {
    const { student } = await scene();
    await expect(
      updateTask(student.id, "00000000-0000-0000-0000-000000000000", { status: "done" }),
    ).rejects.toThrow("任务不存在");
  });

  it("patch 夹带越权字段（如 projectId）不会被写入", async () => {
    const { owner, team, student, project } = await scene();
    const other = await createProject(owner.id, team.id, { name: "另一项目" });
    const t = await createTask(student.id, project.id, { title: "任务" });
    const evil = { status: "done", projectId: other.id, sortOrder: -1 } as Parameters<typeof updateTask>[2];
    const updated = await updateTask(student.id, t.id, evil);
    expect(updated.status).toBe("done");
    expect(updated.projectId).toBe(project.id);  // 未被挪走
    expect(updated.sortOrder).toBe(t.sortOrder); // 未被篡改
  });
});

describe("moveTask", () => {
  beforeEach(resetDb);

  it("任务负责人可以把任务拖到待审核", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "待提交",
      assigneeIds: [student.id],
    });
    const moved = await moveTask(student.id, task.id, "doing");
    expect(moved.status).toBe("doing");
  });

  it("非负责人不能拖动任务", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "他人任务",
      assigneeIds: [owner.id],
    });
    await expect(moveTask(student.id, task.id, "doing")).rejects.toThrow(
      "只有任务负责人或项目管理员可以拖动任务",
    );
  });

  it("待审核任务只有项目管理员可以继续拖动", async () => {
    const { owner, student, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "待审核",
      assigneeIds: [student.id],
      status: "doing",
    });
    await expect(moveTask(student.id, task.id, "done")).rejects.toThrow(
      "待审核任务只能由项目管理员移动",
    );
    const moved = await moveTask(owner.id, task.id, "done");
    expect(moved.status).toBe("done");
  });

  it("被指派的 teacher 也拥有拖动权限", async () => {
    const { owner, teacher, project } = await scene();
    const task = await createTask(owner.id, project.id, {
      title: "导师待办",
      assigneeIds: [teacher.id],
    });
    const moved = await moveTask(teacher.id, task.id, "doing");
    expect(moved.status).toBe("doing");
  });
});

describe("deleteTask / listProjectTasks", () => {
  beforeEach(resetDb);

  it("student 可删任务；列表随之减少且带负责人姓名", async () => {
    const { student, project } = await scene();
    const t1 = await createTask(student.id, project.id, {
      title: "甲",
      assigneeId: student.id,
    });
    await createTask(student.id, project.id, { title: "乙" });

    let list = await listProjectTasks(student.id, project.id);
    expect(list).toHaveLength(2);
    expect(list.find((x) => x.id === t1.id)?.assigneeName).toBe("student");

    await deleteTask(student.id, t1.id);
    list = await listProjectTasks(student.id, project.id);
    expect(list).toHaveLength(1);
  });

  it("teacher 可看列表但不可删", async () => {
    const { student, teacher, project } = await scene();
    const t = await createTask(student.id, project.id, { title: "甲" });
    expect(await listProjectTasks(teacher.id, project.id)).toHaveLength(1);
    await expect(deleteTask(teacher.id, t.id)).rejects.toThrow("没有权限");
  });
});

describe("任务 startDate（时间线地基）", () => {
  beforeEach(resetDb);

  it("createTask 可存起始日，listProjectTasks 回读", async () => {
    const { student, project } = await scene();
    const t = await createTask(student.id, project.id, {
      title: "实验一",
      startDate: "2026-07-01",
      dueDate: "2026-07-08",
    });
    expect(t.startDate).toBe("2026-07-01");
    const [row] = await listProjectTasks(student.id, project.id);
    expect(row.startDate).toBe("2026-07-01");
    expect(row.dueDate).toBe("2026-07-08");
  });

  it("updateTask 可改起始日，可清空为 null", async () => {
    const { student, project } = await scene();
    const t = await createTask(student.id, project.id, { title: "实验" });
    const u1 = await updateTask(student.id, t.id, { startDate: "2026-07-02" });
    expect(u1.startDate).toBe("2026-07-02");
    const u2 = await updateTask(student.id, t.id, { startDate: null });
    expect(u2.startDate).toBeNull();
  });
});

describe("createTask 记录创建者", () => {
  beforeEach(resetDb);

  it("createdById = 操作者", async () => {
    const { student, project } = await scene();
    const t = await createTask(student.id, project.id, { title: "筹备粮草" });

    const [row] = await db
      .select({ createdById: tasks.createdById })
      .from(tasks)
      .where(eq(tasks.id, t.id));
    expect(row.createdById).toBe(student.id);
  });
});
