import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api-error";
import {
  clearAiSettings,
  getAiSettingsView,
  saveAiSettings,
} from "@/lib/agent/ai-settings";
import { testAiConnection } from "@/lib/agent/model";

export const runtime = "nodejs";

// 所有字段都可选：只改模型时不必重输密钥；密钥留空＝沿用已存的那把。
const settingsSchema = z.object({
  apiKey: z.string().trim().max(256, "API Key 过长").optional(),
  baseUrl: z.string().trim().max(256, "接口地址过长").optional(),
  model: z.string().trim().max(128, "模型名过长").optional(),
  provider: z.string().trim().max(64, "提供方名称过长").optional(),
});

async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "请先登录" }, { status: 401 });

  try {
    return Response.json(await getAiSettingsView(userId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "请先登录" }, { status: 401 });

  const parsed = settingsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    return Response.json(await saveAiSettings(userId, parsed.data));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "请先登录" }, { status: 401 });

  try {
    return Response.json(await clearAiSettings(userId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

// 测试连接：拿提交的（或已保存的）配置真发一次请求，只回 ok/error，不落库。
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "请先登录" }, { status: 401 });

  const parsed = settingsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const result = await testAiConnection(userId, parsed.data);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
