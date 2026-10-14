import type { FilterableTask, GroupBy } from "./board-filters";

export type ColumnPatch = {
  status?: "todo" | "doing" | "done";
};

export type BoardColumn = {
  key: string;
  label: string;
  tone: string; // tailwind 文字色 class
  patch: ColumnPatch;
  matches: (t: FilterableTask) => boolean;
};

export type ColumnContext = {
  members: { id: string; name: string }[];
  milestones: { id: string; name: string }[];
};

export function supportsTaskCreation(column: BoardColumn) {
  return column.patch.status === "todo";
}

const NEUTRAL = "text-ink-soft";

export function deriveColumns(group: GroupBy, ctx: ColumnContext): BoardColumn[] {
  switch (group) {
    case "assignee":
      return [
        ...ctx.members.map((m) => ({
          key: m.id,
          label: m.name,
          tone: NEUTRAL,
          patch: {},
          matches: (t: FilterableTask) => t.assigneeIds.includes(m.id),
        })),
        {
          key: "none",
          label: "未指派",
          tone: "text-ink-faint",
          patch: {},
          matches: (t: FilterableTask) => t.assigneeIds.length === 0,
        },
      ];

    case "priority":
      return (
        [
          { key: "high", label: "高", tone: "text-high" },
          { key: "medium", label: "中", tone: "text-medium" },
          { key: "low", label: "低", tone: "text-low" },
        ] as const
      ).map((c) => ({
        key: c.key,
        label: c.label,
        tone: c.tone,
        patch: {},
        matches: (t: FilterableTask) => t.priority === c.key,
      }));

    case "milestone":
      return [
        ...ctx.milestones.map((m) => ({
          key: m.id,
          label: m.name,
          tone: NEUTRAL,
          patch: {},
          matches: (t: FilterableTask) => t.milestoneId === m.id,
        })),
        {
          key: "none",
          label: "无里程碑",
          tone: "text-ink-faint",
          patch: {},
          matches: (t: FilterableTask) => t.milestoneId === null,
        },
      ];

    case "status":
    default:
      return (
        [
          { key: "todo", label: "待办", tone: "text-todo" },
          { key: "doing", label: "待审核", tone: "text-doing" },
          { key: "done", label: "已完成", tone: "text-done" },
        ] as const
      ).map((c) => ({
        key: c.key,
        label: c.label,
        tone: c.tone,
        patch: { status: c.key } as ColumnPatch,
        matches: (t: FilterableTask) => t.status === c.key,
      }));
  }
}

// 标签色板：色板键 → tailwind class。存键不存 hex，配色可控且杜绝样式注入。
export const LABEL_COLORS = [
  "slate",
  "red",
  "amber",
  "green",
  "blue",
  "violet",
  "pink",
] as const;

export const LABEL_COLOR_CLASS: Record<string, string> = {
  slate: "bg-sunken text-ink-soft",
  red: "bg-high-soft text-high",
  amber: "bg-medium-soft text-medium",
  green: "bg-low-soft text-low",
  blue: "bg-primary-soft text-primary",
  violet: "bg-primary-soft text-primary",
  pink: "bg-high-soft text-high",
};
