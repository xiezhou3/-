// 看板筛选态 ↔ URL query 的纯函数模块。无 IO、不取系统时钟，
// 「今日」由调用方传入，便于单测。
import { WORK_ITEM_TYPES } from "./work-item";

export type GroupBy = "status" | "assignee" | "priority" | "milestone" | "type";

export type BoardFilters = {
  assignee: string[]; // uuid 或 "none"（未指派）
  priority: string[];
  label: string[]; // uuid
  milestone: string[]; // uuid 或 "none"（无里程碑）
  workItemType: string[];
  sprint: string; // default / all / backlog / uuid
  overdue: boolean;
  group: GroupBy;
};

export type FilterableTask = {
  assigneeId: string | null;
  assigneeIds: string[];
  statusId: string | null;
  priority: string;
  workItemType: string;
  milestoneId: string | null;
  dueDate: string | null;
  status: string;
  labels: { id: string }[];
};

const GROUPS: GroupBy[] = ["status", "assignee", "priority", "milestone", "type"];
const PRIORITIES = ["low", "medium", "high"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EMPTY_FILTERS: BoardFilters = {
  assignee: [],
  priority: [],
  label: [],
  milestone: [],
  workItemType: [],
  sprint: "default",
  overdue: false,
  group: "status",
};

function idList(raw: string | null, allowNone: boolean): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s) || (allowNone && s === "none"));
}

export function parseFilters(params: URLSearchParams): BoardFilters {
  const group = params.get("group");
  return {
    assignee: idList(params.get("assignee"), true),
    priority: (params.get("priority") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => PRIORITIES.includes(s)),
    label: idList(params.get("label"), false),
    milestone: idList(params.get("milestone"), true),
    workItemType: (params.get("workType") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) =>
        WORK_ITEM_TYPES.includes(value as (typeof WORK_ITEM_TYPES)[number]),
      ),
    sprint:
      params.get("sprint") === "all" ||
      params.get("sprint") === "backlog" ||
      (params.get("sprint") && UUID_RE.test(params.get("sprint")!))
        ? params.get("sprint")!
        : "default",
    overdue: params.get("overdue") === "1",
    group: GROUPS.includes(group as GroupBy) ? (group as GroupBy) : "status",
  };
}

// 返回不含 "?" 的 query string；空筛选返回空串（URL 保持干净）
export function serializeFilters(f: BoardFilters): string {
  const p = new URLSearchParams();
  if (f.assignee.length) p.set("assignee", f.assignee.join(","));
  if (f.priority.length) p.set("priority", f.priority.join(","));
  if (f.label.length) p.set("label", f.label.join(","));
  if (f.milestone.length) p.set("milestone", f.milestone.join(","));
  if (f.workItemType.length) p.set("workType", f.workItemType.join(","));
  if (f.sprint !== "default") p.set("sprint", f.sprint);
  if (f.overdue) p.set("overdue", "1");
  if (f.group !== "status") p.set("group", f.group);
  return p.toString();
}

export function applyFilters<T extends FilterableTask>(
  list: T[],
  f: BoardFilters,
  today: string,
): T[] {
  return list.filter((t) => {
    if (
      f.assignee.length &&
      !f.assignee.some((id) =>
        id === "none" ? t.assigneeIds.length === 0 : t.assigneeIds.includes(id),
      )
    ) {
      return false;
    }
    if (f.priority.length && !f.priority.includes(t.priority)) return false;
    if (
      f.workItemType.length &&
      !f.workItemType.includes(t.workItemType)
    ) {
      return false;
    }
    if (f.milestone.length && !f.milestone.includes(t.milestoneId ?? "none")) return false;
    if (f.label.length && !t.labels.some((l) => f.label.includes(l.id))) return false;
    if (f.overdue && !(t.dueDate && t.dueDate < today && t.status !== "done")) return false;
    return true;
  });
}

export function resolveSprintFilter(
  requested: string,
  activeSprintId: string | null,
) {
  if (requested === "default") return activeSprintId ?? "all";
  return requested;
}

export function applySprintFilter<T extends { sprintId: string | null }>(
  list: T[],
  sprint: string,
): T[] {
  if (sprint === "all") return list;
  if (sprint === "backlog") return list.filter((task) => task.sprintId === null);
  return list.filter((task) => task.sprintId === sprint);
}
