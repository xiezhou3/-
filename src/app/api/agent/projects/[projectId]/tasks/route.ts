import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateBearer, unauthorized, mapAgentError } from "@/lib/agent-auth";
import { createTask, listProjectTasks } from "@/lib/task";
import { WORK_ITEM_TYPES } from "@/lib/work-item";

type Ctx = { params: Promise<{ projectId: string }> };

function parseProjectId(raw: string) {
  const r = z.uuid().safeParse(raw);
  return r.success ? r.data : null;
}

const filterSchema = z.object({
  status: z.enum(["todo", "doing", "done"]).optional(),
  statusId: z.uuid().optional(),
  workItemType: z.enum(WORK_ITEM_TYPES).optional(),
  assigneeId: z.uuid().optional(),
  dueBefore: z.string().optional(),
  releaseId: z.uuid().optional(),
});

// CC 读取：列出该项目任务，可按状态/负责人/截止日筛。填补「CC 无读端点」之缺。
export async function GET(req: Request, ctx: Ctx) {
  const userId = await authenticateBearer(req);
  if (!userId) return unauthorized();

  const { projectId: raw } = await ctx.params;
  const projectId = parseProjectId(raw);
  if (!projectId) return NextResponse.json({ error: "projectId 无效" }, { status: 400 });

  const q = new URL(req.url).searchParams;
  const parsed = filterSchema.safeParse({
    status: q.get("status") ?? undefined,
    statusId: q.get("statusId") ?? undefined,
    workItemType: q.get("workItemType") ?? undefined,
    assigneeId: q.get("assigneeId") ?? undefined,
    dueBefore: q.get("dueBefore") ?? undefined,
    releaseId: q.get("releaseId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const f = parsed.data;

  try {
    let rows = await listProjectTasks(userId, projectId);
    if (f.status) rows = rows.filter((t) => t.status === f.status);
    if (f.statusId) rows = rows.filter((t) => t.statusId === f.statusId);
    if (f.workItemType) rows = rows.filter((t) => t.workItemType === f.workItemType);
    if (f.assigneeId) rows = rows.filter((t) => t.assigneeIds.includes(f.assigneeId!));
    if (f.dueBefore) rows = rows.filter((t) => t.dueDate !== null && t.dueDate <= f.dueBefore!);
    if (f.releaseId) rows = rows.filter((t) => t.releaseId === f.releaseId);

    return NextResponse.json({
      tasks: rows.map((t) => ({
        id: t.id,
        taskNumber: t.taskNumber,
        title: t.title,
        workItemType: t.workItemType,
        bugSeverity: t.bugSeverity,
        parentWorkItemId: t.parentWorkItemId,
        description: t.description,
        status: t.status,
        statusId: t.statusId,
        statusName: t.statusName,
        priority: t.priority,
        startDate: t.startDate,
        dueDate: t.dueDate,
        milestoneId: t.milestoneId,
        sprintId: t.sprintId,
        releaseId: t.releaseId,
        estimate: t.estimate,
        estimatedHours: t.estimatedHours,
        actualHours: t.actualHours,
        assigneeId: t.assigneeId,
        assigneeIds: t.assigneeIds,
        assignees: t.assignees,
        assigneeName: t.assigneeName,
        completionNote: t.completionNote,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (e) {
    return mapAgentError(e, "[GET /api/agent/projects/:id/tasks]");
  }
}

const createSchema = z.object({
  title: z.string().min(1),
  workItemType: z.enum(WORK_ITEM_TYPES).optional(),
  bugSeverity: z.enum(["blocker", "critical", "major", "minor"]).optional(),
  parentWorkItemId: z.uuid().optional(),
  description: z.string().optional(),
  assigneeId: z.uuid().optional(),
  assigneeIds: z.array(z.uuid()).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  milestoneId: z.uuid().optional(),
  releaseId: z.uuid().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  estimate: z.number().int().nonnegative().optional(),
  estimatedHours: z.number().nonnegative().optional(),
  statusId: z.uuid().optional(),
});

// CC 写入：在该项目下新建任务（projectId 取自路径）。
// 与既有 POST /api/agent/tasks（projectId 在 body）并存：后者为旧约，不折损在用之 skill。
export async function POST(req: Request, ctx: Ctx) {
  const userId = await authenticateBearer(req);
  if (!userId) return unauthorized();

  const { projectId: raw } = await ctx.params;
  const projectId = parseProjectId(raw);
  if (!projectId) return NextResponse.json({ error: "projectId 无效" }, { status: 400 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const task = await createTask(userId, projectId, parsed.data);
    return NextResponse.json({
      id: task.id,
      title: task.title,
      status: task.status,
      workItemType: task.workItemType,
      bugSeverity: task.bugSeverity,
      parentWorkItemId: task.parentWorkItemId,
      statusId: task.statusId,
      releaseId: task.releaseId,
      estimate: task.estimate,
      estimatedHours: task.estimatedHours,
    });
  } catch (e) {
    return mapAgentError(e, "[POST /api/agent/projects/:id/tasks]");
  }
}
