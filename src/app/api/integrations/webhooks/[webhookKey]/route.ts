import { NextResponse } from "next/server";
import { z } from "zod";
import { mapAgentError } from "@/lib/agent-auth";
import { ingestExternalEvent } from "@/lib/integrations";

type Ctx = { params: Promise<{ webhookKey: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { webhookKey } = await ctx.params;
  if (!z.string().min(16).max(100).safeParse(webhookKey).success) {
    return NextResponse.json({ error: "Webhook 无效" }, { status: 401 });
  }
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: "Webhook 内容过大" }, { status: 413 });
  }
  const payload = await req.json().catch(() => null);
  if (payload === null) {
    return NextResponse.json({ error: "Webhook 必须是 JSON" }, { status: 400 });
  }

  try {
    const event = await ingestExternalEvent(webhookKey, {
      eventHeader:
        req.headers.get("x-github-event") ??
        req.headers.get("x-gitlab-event"),
      payload,
    });
    return NextResponse.json({ ok: true, eventId: event.id });
  } catch (error) {
    return mapAgentError(error, "[POST /api/integrations/webhooks/:key]");
  }
}
