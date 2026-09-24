import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getProjectFileAccess } from "@/lib/project-file-service";
import { isOfficePreviewFile } from "@/lib/office-preview";
import { FileViewer } from "./file-viewer";

export default async function ProjectFileViewPage({
  params,
}: {
  params: Promise<{ projectId: string; fileId: string }>;
}) {
  const { projectId, fileId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(fileId).success) {
    notFound();
  }

  const access = await getProjectFileAccess(session.user.id, fileId);
  if (access.file.projectId !== projectId || access.file.status !== "ready") {
    notFound();
  }
  const file = access.file;

  if (file.source === "link") {
    if (!file.externalUrl) notFound();
    redirect(file.externalUrl);
  }

  const contentUrl = `/api/project-files/${file.id}/content`;
  const downloadUrl = `${contentUrl}?download=1`;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const viewerType =
    file.kind === "video"
      ? "video"
      : file.kind === "audio"
        ? "audio"
        : extension === "pdf" || file.mimeType === "application/pdf"
          ? "pdf"
          : isOfficePreviewFile(file)
            ? "office"
            : "unsupported";

  return (
    <main className="mx-auto max-w-6xl space-y-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/projects/${projectId}/files`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回文件库
          </Link>
          <h1 className="mt-2 break-words font-display text-xl font-semibold text-ink">
            {file.name}
          </h1>
        </div>
        <a href={downloadUrl} download={file.name} className="ac-btn-ghost">
          <Download className="h-4 w-4" aria-hidden />
          下载
        </a>
      </header>

      <FileViewer
        fileId={file.id}
        viewerType={viewerType}
        contentUrl={contentUrl}
      />
    </main>
  );
}
