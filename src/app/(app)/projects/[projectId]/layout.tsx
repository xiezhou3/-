import { notFound, redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  automationRules,
  projectIntegrations,
  teams,
} from "@/db/schema";
import { getProjectForUser } from "@/lib/project";
import { ProjectNavigation } from "./project-navigation";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success) notFound();

  const access = await getProjectForUser(session.user.id, projectId);
  if (!access) notFound();
  const [teamRows, integrationCountRows, automationCountRows] =
    await Promise.all([
      db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, access.project.teamId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectIntegrations)
        .where(eq(projectIntegrations.projectId, projectId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(automationRules)
        .where(eq(automationRules.projectId, projectId)),
    ]);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <ProjectNavigation
        projectId={projectId}
        projectName={access.project.name}
        teamName={teamRows[0]?.name ?? "团队项目"}
        role={access.role}
        status={access.project.status}
        startDate={access.project.startDate}
        endDate={access.project.endDate}
        integrationCount={integrationCountRows[0]?.count ?? 0}
        automationCount={automationCountRows[0]?.count ?? 0}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
