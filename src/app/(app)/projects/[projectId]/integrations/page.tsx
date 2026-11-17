import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { PlugZap } from "lucide-react";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/project";
import {
  defaultIntegrationName,
  getIntegrationOverview,
  type ProjectIntegration,
} from "@/lib/integrations";
import type { IntegrationProvider } from "@/db/schema";
import { IntegrationManager } from "./integration-manager";

export default async function ProjectIntegrationsPage({
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
  const overview = await getIntegrationOverview(session.user.id, projectId);
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  const baseUrl = process.env.AGILECAMPUS_URL ?? (host ? `${protocol}://${host}` : "");
  const integrations = new Map<IntegrationProvider, ProjectIntegration>(
    overview.integrations.map((integration) => [integration.provider, integration]),
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
              <PlugZap className="h-5 w-5 text-primary" aria-hidden />
              集成中心
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              连接代码仓库、CI/CD 和通用 Webhook，将外部研发事件带回任务与 Release。
            </p>
          </div>
        </div>
      </header>

      <IntegrationManager
        projectId={projectId}
        canWrite={access.role === "admin" || access.role === "student"}
        baseUrl={baseUrl.replace(/\/$/, "")}
        integrations={(["github", "gitlab", "ci", "webhook"] as const).map(
          (provider) => ({
            provider,
            defaultName: defaultIntegrationName(provider),
            integration: integrations.get(provider) ?? null,
          }),
        )}
        events={overview.events.map((event) => ({
          id: event.id,
          integrationName: event.integrationName,
          provider: event.provider,
          eventType: event.eventType,
          title: event.title,
          url: event.url,
          actor: event.actor,
          branch: event.branch,
          commitSha: event.commitSha,
          environment: event.environment,
          status: event.status,
          releaseId: event.releaseId,
          occurredAt: event.occurredAt.toISOString(),
          taskIds: event.taskIds,
          taskTitles: event.taskTitles,
        }))}
      />
    </main>
  );
}
