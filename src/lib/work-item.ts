export const WORK_ITEM_TYPES = ["epic", "story", "task", "bug"] as const;
export type WorkItemTypeValue = (typeof WORK_ITEM_TYPES)[number];

export const WORK_ITEM_TYPE_LABEL: Record<WorkItemTypeValue, string> = {
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
};

export const WORK_ITEM_TYPE_DESCRIPTION: Record<WorkItemTypeValue, string> = {
  epic: "跨多个 Story 的大型目标",
  story: "可交付的用户价值单元",
  task: "具体执行工作",
  bug: "需要修复的缺陷",
};

export const WORK_ITEM_TYPE_BADGE: Record<WorkItemTypeValue, string> = {
  epic: "bg-primary-soft text-primary",
  story: "bg-done/12 text-done",
  task: "bg-sunken text-ink-soft",
  bug: "bg-high-soft text-high",
};

export const WORK_ITEM_TYPE_TEXT: Record<WorkItemTypeValue, string> = {
  epic: "text-primary",
  story: "text-done",
  task: "text-ink-soft",
  bug: "text-high",
};

export function isWorkItemType(value: unknown): value is WorkItemTypeValue {
  return (
    typeof value === "string" &&
    WORK_ITEM_TYPES.includes(value as WorkItemTypeValue)
  );
}
