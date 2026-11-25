import { describe, expect, it } from "vitest";
import {
  buildBurndown,
  buildHoursSummary,
  buildSprintProgress,
  buildVelocity,
} from "@/lib/report";

function task(over: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    title: "任务",
    status: "todo",
    estimate: 3,
    estimatedHours: null,
    actualHours: 0,
    sprintId: "sprint-1",
    updatedAt: new Date("2026-11-03T10:00:00+08:00"),
    ...over,
  };
}

const sprint = {
  id: "sprint-1",
  name: "Sprint 1",
  startDate: "2026-11-01",
  endDate: "2026-11-05",
  capacity: 10,
  status: "active",
};

describe("报表统计", () => {
  it("燃尽图包含理想线和截至今日的实际剩余", () => {
    const tasks = [
      task({ estimate: 5, status: "done", updatedAt: new Date("2026-11-03T10:00:00+08:00") }),
      task({ estimate: 5, status: "todo" }),
    ] as Parameters<typeof buildBurndown>[1];
    const data = buildBurndown(sprint as never, tasks, "2026-11-04");
    expect(data).toHaveLength(5);
    expect(data[0].ideal).toBe(10);
    expect(data.at(-1)?.ideal).toBe(0);
    expect(data[2].actual).toBe(5);
    expect(data[3].actual).toBe(5);
    expect(data[4].actual).toBeNull();
  });

  it("Sprint 进度按任务状态和故事点汇总", () => {
    const tasks = [
      task({ estimate: 5, status: "done" }),
      task({ estimate: 3, status: "todo" }),
      task({ estimate: null, status: "todo" }),
    ] as Parameters<typeof buildSprintProgress>[1];
    const progress = buildSprintProgress(
      sprint as never,
      tasks,
      "2026-11-03",
    );
    expect(progress.taskDone).toBe(1);
    expect(progress.taskTotal).toBe(3);
    expect(progress.completedPoints).toBe(5);
    expect(progress.remainingPoints).toBe(3);
    expect(progress.unestimated).toBe(1);
    expect(progress.daysRemaining).toBe(2);
  });

  it("速度图只统计已关闭 Sprint", () => {
    const sprints = [
      { ...sprint, id: "s1", name: "S1", status: "closed", endDate: "2026-11-05" },
      { ...sprint, id: "s2", name: "S2", status: "closed", endDate: "2026-11-12" },
      { ...sprint, id: "s3", name: "S3", status: "active", endDate: "2026-11-19" },
    ] as never;
    const tasks = [
      task({ sprintId: "s1", status: "done", estimate: 8 }),
      task({ sprintId: "s2", status: "done", estimate: 5 }),
      task({ sprintId: "s2", status: "todo", estimate: 3 }),
    ] as Parameters<typeof buildVelocity>[1];
    const data = buildVelocity(sprints, tasks);
    expect(data.map((item) => item.name)).toEqual(["S1", "S2"]);
    expect(data[0].completed).toBe(8);
    expect(data[1].completed).toBe(5);
    expect(data[1].completedTasks).toBe(1);
  });

  it("工时汇总计算预估、实际与偏差", () => {
    const tasks = [
      task({ estimatedHours: 8, actualHours: 5.5 }),
      task({ estimatedHours: 4, actualHours: 2.25 }),
      task({ estimatedHours: null, actualHours: 0 }),
    ] as Parameters<typeof buildHoursSummary>[0];
    const summary = buildHoursSummary(tasks);
    expect(summary.estimatedHours).toBe(12);
    expect(summary.actualHours).toBe(7.75);
    expect(summary.varianceHours).toBe(-4.25);
    expect(summary.estimatedTaskCount).toBe(2);
    expect(summary.loggedTaskCount).toBe(2);
  });
});
