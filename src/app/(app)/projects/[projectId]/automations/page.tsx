import { notFound, redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  AUTOMATION_TEMPLATES,
  listAutomationRules,
} from "@/lib/automation";
import { AutomationManager } from "./automation-manager";

export default async function ProjectAutomationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();
  const data = await listAutomationRules(session.user.id, projectId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
          <Workflow className="h-5 w-5 text-primary" aria-hidden />
          自动化模块中心
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          用固定触发器、条件和动作，把任务、CI/CD 与 Release 事件连接起来。
        </p>
      </header>

      <AutomationManager
        projectId={projectId}
        canWrite={
          data.access.role === "admin" || data.access.role === "student"
        }
        templates={AUTOMATION_TEMPLATES}
        rules={data.rules}
        runs={data.runs}
      />
    </main>
  );
}
