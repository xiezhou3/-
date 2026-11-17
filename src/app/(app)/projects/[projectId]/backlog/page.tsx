import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listBacklogData } from "@/lib/backlog";
import { BacklogWorkspace } from "./backlog-workspace";

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();

  const requestedSprint =
    typeof sp.sprint === "string" && z.uuid().safeParse(sp.sprint).success
      ? sp.sprint
      : undefined;
  const data = await listBacklogData(
    session.user.id,
    projectId,
    requestedSprint,
  );
  const canWrite = data.role === "admin" || data.role === "student";
  const titleById = new Map(
    data.allTasks.map((task) => [task.id, task.title]),
  );
  const mapTask = (task: (typeof data.allTasks)[number]) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    workItemType: task.workItemType,
    parentTitle: task.parentWorkItemId
      ? titleById.get(task.parentWorkItemId) ?? null
      : null,
    estimate: task.estimate,
    assigneeName: task.assigneeName,
    labels: task.labels,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 py-8">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">
              Backlog 规划
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              调整产品待办顺序，并拖拽任务进入选中 Sprint。
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/sprints`}
            className="ac-btn-ghost"
          >
            <CalendarClock className="h-4 w-4" aria-hidden />
            管理迭代
          </Link>
        </div>
      </header>

      <BacklogWorkspace
        key={data.selectedSprint?.id ?? "backlog-only"}
        projectId={projectId}
        canWrite={canWrite}
        sprints={data.sprints.map((sprint) => ({
          id: sprint.id,
          name: sprint.name,
          status: sprint.status,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          capacity: sprint.capacity,
          estimateTotal: sprint.estimateTotal,
          unestimatedTaskCount: sprint.unestimatedTaskCount,
        }))}
        selectedSprintId={data.selectedSprint?.id ?? null}
        backlogTasks={data.backlogTasks.map(mapTask)}
        sprintTasks={data.sprintTasks.map(mapTask)}
      />
    </main>
  );
}
