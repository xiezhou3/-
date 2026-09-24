import { auth } from "@/lib/auth";
import { deleteProjectFile } from "@/lib/project-file-service";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const { fileId } = await params;
    await deleteProjectFile(session.user.id, fileId);
    return Response.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
