import { z } from "zod";
import { auth } from "@/lib/auth";
import { createProjectFileLink } from "@/lib/project-file-service";
import { apiErrorResponse } from "@/lib/api-error";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  url: z.url(),
  kind: z.enum(["presentation", "document", "code", "video", "audio", "other"]),
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
    const parsed = schema.parse(await request.json());
    const result = await createProjectFileLink(
      session.user.id,
      projectId,
      parsed,
    );
    return Response.json({ id: result.id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
