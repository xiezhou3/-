import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-error";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fetchGitHubFile } from "@/lib/github-repository";
import {
  createProjectFileUpload,
  writeProjectFileUpload,
} from "@/lib/project-file-service";
import { getProjectRepository } from "@/lib/project-repository-service";

export const runtime = "nodejs";

const schema = z.object({
  path: z.string().trim().min(1),
  branch: z.string().trim().min(1).max(255),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { projectId } = await params;
    const repository = await getProjectRepository(session.user.id, projectId);
    if (!repository) throw new AppError("尚未连接 GitHub 仓库");
    const parsed = schema.parse(await request.json());
    const file = await fetchGitHubFile(
      repository.owner,
      repository.name,
      parsed.path,
      parsed.branch,
    );
    const upload = await createProjectFileUpload(session.user.id, projectId, {
      name: file.name,
      sizeBytes: file.size,
      mimeType: null,
      kind: "auto",
    });
    await writeProjectFileUpload(
      session.user.id,
      upload.id,
      Readable.from(file.data),
      file.size,
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/files`);
    return Response.json({ id: upload.id, name: file.name }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
