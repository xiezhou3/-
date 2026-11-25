import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/project";
import { getProjectWorkflow } from "@/lib/workflow";
import { WorkflowManager } from "./workflow-manager";

export default async function WorkflowPage({
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
  const workflow = await getProjectWorkflow(session.user.id, projectId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink">
          工作流设置
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          配置看板状态、WIP 上限、列顺序与允许的状态流转。
        </p>
      </header>
      <WorkflowManager
        key={`${workflow.statuses.map((status) => status.id).join(",")}:${workflow.transitions.length}`}
        projectId={projectId}
        isAdmin={access.role === "admin"}
        statuses={workflow.statuses.map((status) => ({
          id: status.id,
          name: status.name,
          category: status.category,
          color: status.color,
          position: status.position,
          wipLimit: status.wipLimit,
          isDefault: status.isDefault,
          taskCount: status.taskCount,
        }))}
        transitions={workflow.transitions}
      />
    </main>
  );
}
