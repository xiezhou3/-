import { beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/project";
import { createRelease } from "@/lib/planning";
import {
  getReleaseDelivery,
  ingestExternalEvent,
  listProjectExternalEvents,
  listTaskExternalEvents,
  normalizeExternalEvent,
  rotateIntegrationKey,
  upsertProjectIntegration,
} from "@/lib/integrations";
import { createTask } from "@/lib/task";
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
  const team = await createTeam(owner.id, "集成实验室");
  const student = await makeUser("student@example.com");
  await joinTeam(student.id, team.inviteCode);
  const teacher = await makeUser("teacher@example.com");
  await joinTeam(teacher.id, team.inviteCode);
  await updateMemberRole(owner.id, team.id, teacher.id, "teacher");
  const project = await createProject(owner.id, team.id, { name: "集成项目" });
  const release = await createRelease(owner.id, project.id, {
    name: "v1.0",
    targetDate: "2026-12-01",
  });
  const task = await createTask(owner.id, project.id, {
    title: "实现集成中心",
    releaseId: release.id,
  });
  return { owner, student, teacher, project, release, task };
}

describe("代码与 CI/CD 集成", () => {
  beforeEach(resetDb);

  it("GitHub PR 事件自动关联任务和 Release", async () => {
    const { owner, project, release, task } = await scene();
    const integration = await upsertProjectIntegration(
      owner.id,
      project.id,
      "github",
      {
        name: "主仓库",
        repositoryUrl: "https://github.com/example/repo",
        status: "active",
      },
    );

    const event = await ingestExternalEvent(integration.webhookKey, {
      eventHeader: "pull_request",
      payload: {
        action: "closed",
        pull_request: {
          number: 12,
          title: `feat: 完成集成 #${task.taskNumber}`,
          html_url: "https://github.com/example/repo/pull/12",
          body: `Closes #${task.taskNumber}`,
          state: "closed",
          merged: true,
          head: { ref: `feat/${task.taskNumber}-integration`, sha: "abc123" },
          updated_at: "2026-11-17T08:00:00Z",
        },
        sender: { login: "octocat" },
        releaseId: release.id,
      },
    });

    expect(event.eventType).toBe("pull_request");
    expect(event.status).toBe("merged");
    expect(event.releaseId).toBe(release.id);
    const taskEvents = await listTaskExternalEvents(owner.id, task.id);
    expect(taskEvents[0]).toEqual(
      expect.objectContaining({
        id: event.id,
        provider: "github",
        branch: `feat/${task.taskNumber}-integration`,
      }),
    );
    const releaseData = await getReleaseDelivery(owner.id, release.id);
    expect(releaseData?.events.map((item) => item.id)).toContain(event.id);
  });

  it("CI/CD 通用事件可关联编号任务，轮换密钥后旧地址失效", async () => {
    const { owner, project, task } = await scene();
    const integration = await upsertProjectIntegration(
      owner.id,
      project.id,
      "ci",
      { name: "Jenkins", status: "active" },
    );
    await ingestExternalEvent(integration.webhookKey, {
      eventHeader: "pipeline",
      payload: {
        eventType: "pipeline",
        title: "build",
        status: "success",
        branch: `ci/#${task.taskNumber}`,
        commitSha: "deadbeef",
      },
    });
    const events = await listProjectExternalEvents(owner.id, project.id);
    expect(events[0].taskIds).toContain(task.id);
    expect(events[0].status).toBe("success");

    const rotated = await rotateIntegrationKey(owner.id, integration.id);
    expect(rotated.webhookKey).not.toBe(integration.webhookKey);
    await expect(
      ingestExternalEvent(integration.webhookKey, {
        eventHeader: "pipeline",
        payload: { title: "旧密钥" },
      }),
    ).rejects.toThrow("Webhook 无效");
  });

  it("教师只读，通用事件解析任务编号", async () => {
    const { student, teacher, project } = await scene();
    await expect(
      upsertProjectIntegration(teacher.id, project.id, "webhook", {
        name: "教师 Webhook",
      }),
    ).rejects.toThrow("没有权限");
    const integration = await upsertProjectIntegration(
      student.id,
      project.id,
      "webhook",
      { name: "学生 Webhook" },
    );
    expect(integration.provider).toBe("webhook");
    const normalized = normalizeExternalEvent("webhook", null, {
      event: "custom",
      title: "task-7 完成",
      taskNumbers: [8],
    });
    expect(normalized.taskNumbers).toEqual([7, 8]);
  });
});
