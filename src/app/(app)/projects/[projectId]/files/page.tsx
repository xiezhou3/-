import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getProjectForUser } from "@/lib/project";
import { listProjectFiles } from "@/lib/project-file-service";
import { ProjectFilesLibrary } from "@/components/project-files/project-files-library";

export default async function ProjectFilesPage({
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

  const files = await listProjectFiles(session.user.id, projectId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <header>
        <div>
          <p className="text-sm text-ink-soft">{access.project.name}</p>
          <h1 className="font-display text-2xl font-semibold text-ink">项目文件</h1>
        </div>
      </header>
      <ProjectFilesLibrary
        key={projectId}
        projectId={projectId}
        projectName={access.project.name}
        files={files}
        variant="full"
      />
    </main>
  );
}
