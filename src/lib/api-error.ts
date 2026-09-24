import { AppError, ForbiddenError } from "./errors";
import { ZodError } from "zod";

export function apiErrorResponse(error: unknown) {
  if ((error as { code?: string })?.code === "ENOENT") {
    return Response.json({ error: "文件内容不存在" }, { status: 404 });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "请求参数无效" },
      { status: 400 },
    );
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof AppError) {
    const status = error.message.includes("不存在") ? 404 : 400;
    return Response.json({ error: error.message }, { status });
  }
  console.error("[api] 未处理错误", error);
  return Response.json({ error: "服务器内部错误" }, { status: 500 });
}
