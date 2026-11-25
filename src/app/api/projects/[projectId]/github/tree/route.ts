import { apiErrorResponse } from "@/lib/api-error";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fetchGitHubTree } from "@/lib/github-repository";
import { getProjectRepository } from "@/lib/project-repository-service";

export const runtime = "nodejs";

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
    const branch =
      new URL(request.url).searchParams.get("branch") ||
      repository.defaultBranch;
    if (!branch.trim() || branch.length > 255) {
      throw new AppError("分支名称无效");
    }
    const tree = await fetchGitHubTree(
      repository.owner,
      repository.name,
      branch.trim(),
    );
    return Response.json(tree);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
