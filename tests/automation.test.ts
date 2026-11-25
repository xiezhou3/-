import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, tasks } from "@/db/schema";
import {
  AUTOMATION_TEMPLATES,
  createAutomationRule,
  listAutomationRules,
} from "@/lib/automation";
import {
  ingestExternalEvent,
  upsertProjectIntegration,
} from "@/lib/integrations";
import { createProject } from "@/lib/project";
import { createTask, listProjectTasks, updateTask } from "@/lib/task";
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
  const team = await createTeam(owner.id, "自动化实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const project = await createProject(owner.id, team.id, { name: "自动化项目" });
  return { owner, student, teacher, project };
}

describe("自动化规则", () => {
  beforeEach(resetDb);

  it("CI 失败模板自动创建高优先级 Bug", async () => {
    const { owner, project } = await scene();
    const integration = await upsertProjectIntegration(
      owner.id,
      project.id,
      "ci",
      { name: "GitHub Actions" },
    );
    const template = AUTOMATION_TEMPLATES.find(
      (item) => item.id === "ci-failure-bug",
    )!;
    await createAutomationRule(owner.id, project.id, template);

    await ingestExternalEvent(integration.webhookKey, {
      eventHeader: "workflow_run",
      payload: {
        eventType: "pipeline",
        title: "Unit Tests",
        status: "failure",
        branch: "feat/automation",
      },
    });

    const rows = await listProjectTasks(owner.id, project.id);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "CI 失败：Unit Tests",
          workItemType: "bug",
          bugSeverity: "major",
          priority: "high",
        }),
      ]),
    );
    const { runs } = await listAutomationRules(owner.id, project.id);
    expect(runs[0]).toEqual(
      expect.objectContaining({
        ruleName: "CI 失败自动创建 Bug",
        status: "success",
      }),
    );
  });

  it("高优先级任务完成后通知项目管理员", async () => {
    const { owner, project } = await scene();
    await createAutomationRule(owner.id, project.id, {
      name: "高优完成通知",
      triggerType: "task_status_changed",
      conditions: { toStatus: "done", priority: "high" },
      actionType: "notify",
      actionConfig: {
        recipient: "admins",
        title: "任务完成：{{title}}",
        body: "自动化通知",
      },
    });
    const task = await createTask(owner.id, project.id, {
      title: "关键任务",
      priority: "high",
    });
    await updateTask(owner.id, task.id, { status: "done" });

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "automation"));
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: owner.id,
          title: "任务完成：关键任务",
        }),
      ]),
    );
  });

  it("PR 合并模板推进关联任务状态", async () => {
    const { owner, project } = await scene();
    const integration = await upsertProjectIntegration(
      owner.id,
      project.id,
      "github",
      { name: "GitHub" },
    );
    const task = await createTask(owner.id, project.id, {
      title: "合并后开始验证",
    });
    await createAutomationRule(owner.id, project.id, {
      name: "PR 合并推进",
      triggerType: "external_event",
      conditions: { eventType: "pull_request", eventStatus: "merged" },
      actionType: "set_task_status",
      actionConfig: { status: "doing" },
    });
    await ingestExternalEvent(integration.webhookKey, {
      eventHeader: "pull_request",
      payload: {
        action: "closed",
        pull_request: {
          number: 2,
          title: `merge #${task.taskNumber}`,
          state: "closed",
          merged: true,
          head: { ref: `feat/#${task.taskNumber}`, sha: "abc" },
        },
      },
    });
    const [updated] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(updated.status).toBe("doing");
  });

  it("教师不能创建规则", async () => {
    const { teacher, project } = await scene();
    await expect(
      createAutomationRule(teacher.id, project.id, {
        name: "教师规则",
        triggerType: "external_event",
        conditions: { eventType: "pipeline" },
        actionType: "notify",
        actionConfig: { recipient: "admins" },
      }),
    ).rejects.toThrow("没有权限");
  });
});
