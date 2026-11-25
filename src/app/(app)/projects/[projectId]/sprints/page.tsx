import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/project";
import { listProjectSprints } from "@/lib/sprint";
import { listProjectTasks } from "@/lib/task";
import { SprintManager } from "./sprint-manager";

export default async function ProjectSprintsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();

  const access = await getProjectForUser(session.user.id, projectId);
  if (!access) notFound();

  const [sprintList, taskList] = await Promise.all([
    listProjectSprints(session.user.id, projectId),
    listProjectTasks(session.user.id, projectId),
  ]);
  const canWrite = access.role === "admin" || access.role === "student";

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">
              迭代管理
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              规划 Sprint、维护故事点容量并处理迭代收尾。
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/backlog`}
            className="ac-btn-ghost"
          >
            打开 Backlog
          </Link>
        </div>
      </header>

      <SprintManager
        projectId={projectId}
        canWrite={canWrite}
        sprints={sprintList.map((sprint) => ({
          id: sprint.id,
          name: sprint.name,
          goal: sprint.goal,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          capacity: sprint.capacity,
          status: sprint.status,
          taskCount: sprint.taskCount,
          doneTaskCount: sprint.doneTaskCount,
          estimateTotal: sprint.estimateTotal,
          completedEstimate: sprint.completedEstimate,
          unestimatedTaskCount: sprint.unestimatedTaskCount,
        }))}
        tasks={taskList.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          workItemType: task.workItemType,
          estimate: task.estimate,
          sprintId: task.sprintId,
          assigneeName: task.assigneeName,
        }))}
      />
    </main>
  );
}
