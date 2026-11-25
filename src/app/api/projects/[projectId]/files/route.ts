import { auth } from "@/lib/auth";
import {
  fileSummaryFor,
  listProjectFiles,
} from "@/lib/project-file-service";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { projectId } = await params;
    const files = await listProjectFiles(session.user.id, projectId);
    return Response.json({ files, summary: fileSummaryFor(files) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
