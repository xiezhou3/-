import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-error";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fetchGitHubFile } from "@/lib/github-repository";
import { getProjectRepository } from "@/lib/project-repository-service";

export const runtime = "nodejs";

const querySchema = z.object({
  path: z.string().trim().min(1),
  branch: z.string().trim().min(1).max(255),
});

export async function GET(
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
    const parsed = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const file = await fetchGitHubFile(
      repository.owner,
      repository.name,
      parsed.path,
      parsed.branch,
    );
    return new Response(file.data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Content-Length": String(file.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
