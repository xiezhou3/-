"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { BookmarkPlus, Pin, Save, X } from "lucide-react";
import {
  EMPTY_FILTERS,
  parseFilters,
  serializeFilters,
  type BoardFilters,
  type GroupBy,
} from "@/lib/board-filters";
import {
  WORK_ITEM_TYPE_LABEL,
  WORK_ITEM_TYPES,
} from "@/lib/work-item";
import {
  deleteSavedViewAction,
  saveSavedViewAction,
} from "./view-actions";

type Option = { id: string; name: string };

const GROUP_LABEL: Record<GroupBy, string> = {
  status: "状态",
  assignee: "指派人",
  priority: "优先级",
  milestone: "里程碑",
  type: "工作项类型",
};

const PRIORITY_OPTIONS: Option[] = [
  { id: "high", name: "高" },
  { id: "medium", name: "中" },
  { id: "low", name: "低" },
];

export function FilterBar({
  projectId,
  currentUserId,
  members,
  milestones,
  labels,
  sprints,
  visible,
  total,
  savedViews,
}: {
  projectId: string;
  currentUserId: string;
  members: Option[];
  milestones: Option[];
  labels: Option[];
  sprints: Option[];
  visible: number;
  total: number;
  savedViews: { id: string; name: string; filters: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = parseFilters(new URLSearchParams(searchParams.toString()));
  const [showSave, setShowSave] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();
  const currentQuery = serializeFilters(filters);

  // 筛选态写入 URL：可分享、可刷新保持、可后退。scroll:false 免得跳回页首。
  function push(next: BoardFilters) {
    const qs = serializeFilters(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function pushQuery(query: string) {
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function toggle(key: "assignee" | "priority" | "label" | "milestone", id: string) {
    const cur = filters[key];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    push({ ...filters, [key]: next });
  }

  const dirty =
    filters.assignee.length > 0 ||
    filters.priority.length > 0 ||
    filters.label.length > 0 ||
    filters.milestone.length > 0 ||
    filters.workItemType.length > 0 ||
    filters.sprint !== "default" ||
    filters.overdue;

  const commonViews: { name: string; filters: BoardFilters }[] = [
    { name: "全部任务", filters: { ...EMPTY_FILTERS, sprint: "all" } },
    {
      name: "分配给我",
      filters: { ...EMPTY_FILTERS, sprint: "all", assignee: [currentUserId] },
    },
    {
      name: "高优先级",
      filters: { ...EMPTY_FILTERS, sprint: "all", priority: ["high"] },
    },
    {
      name: "逾期任务",
      filters: { ...EMPTY_FILTERS, sprint: "all", overdue: true },
    },
    {
      name: "未指派",
      filters: { ...EMPTY_FILTERS, sprint: "all", assignee: ["none"] },
    },
  ];

  return (
    <div className="space-y-2 rounded-xl border border-line bg-sunken p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-2">
        <span className="flex items-center gap-1 text-xs font-medium text-ink-soft">
          <Pin className="h-3.5 w-3.5" aria-hidden />
          常用视图
        </span>
        {commonViews.map((view) => (
          <button
            key={view.name}
            type="button"
            onClick={() => pushQuery(serializeFilters(view.filters))}
            className="ac-badge bg-surface text-ink-soft transition hover:bg-primary-soft hover:text-primary"
          >
            {view.name}
          </button>
        ))}

        {savedViews.length > 0 && (
          <>
            <span className="ml-2 text-xs font-medium text-ink-soft">我的视图</span>
            {savedViews.map((view) => (
              <span
                key={view.id}
                className="inline-flex items-center overflow-hidden rounded-full border border-line bg-surface"
              >
                <button
                  type="button"
                  onClick={() => pushQuery(view.filters)}
                  className="px-2 py-1 text-xs text-ink-soft transition hover:bg-primary-soft hover:text-primary"
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`删除视图“${view.name}”？`)) return;
                    startTransition(async () => {
                      const result = await deleteSavedViewAction({
                        viewId: view.id,
                        projectId,
                      });
                      if (result.ok) router.refresh();
                    });
                  }}
                  disabled={pending}
                  className="border-l border-line px-1.5 py-1 text-ink-faint hover:bg-high-soft hover:text-high"
                  aria-label={`删除视图 ${view.name}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </>
        )}

        <div className="ml-auto">
          {showSave ? (
            <form
              action={(formData) => {
                const name = String(formData.get("name") ?? "");
                setSaveError("");
                startTransition(async () => {
                  const result = await saveSavedViewAction({
                    projectId,
                    name,
                    filters: currentQuery,
                  });
                  if (!result.ok) {
                    setSaveError(result.error);
                    return;
                  }
                  setShowSave(false);
                  router.refresh();
                });
              }}
              className="flex items-center gap-1"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="filters" value={currentQuery} />
              <input
                name="name"
                className="ac-field w-36 py-1 text-xs"
                placeholder="视图名称"
                autoFocus
                required
              />
              <button disabled={pending} className="ac-btn px-2 py-1 text-xs">
                <Save className="h-3.5 w-3.5" aria-hidden />
                {pending ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setShowSave(false)}
                className="text-xs text-ink-faint"
              >
                取消
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowSave(true)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
              保存当前视图
            </button>
          )}
        </div>
        {saveError && (
          <p className="basis-full text-xs text-high">{saveError}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Group name="迭代">
          <select
            value={filters.sprint}
            onChange={(event) => push({ ...filters, sprint: event.target.value })}
            className="ac-field w-auto py-1 text-sm"
            aria-label="按迭代筛选"
          >
            <option value="default">当前迭代</option>
            <option value="all">全部任务</option>
            <option value="backlog">Backlog</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
              </option>
            ))}
          </select>
        </Group>

        <Group name="指派人">
          {[...members, { id: "none", name: "未指派" }].map((m) => (
            <Chip
              key={m.id}
              on={filters.assignee.includes(m.id)}
              onClick={() => toggle("assignee", m.id)}
            >
              {m.name}
            </Chip>
          ))}
        </Group>

        <Group name="优先级">
          {PRIORITY_OPTIONS.map((p) => (
            <Chip
              key={p.id}
              on={filters.priority.includes(p.id)}
              onClick={() => toggle("priority", p.id)}
            >
              {p.name}
            </Chip>
          ))}
        </Group>

        <Group name="工作项">
          {WORK_ITEM_TYPES.map((type) => (
            <Chip
              key={type}
              on={filters.workItemType.includes(type)}
              onClick={() =>
                push({
                  ...filters,
                  workItemType: filters.workItemType.includes(type)
                    ? filters.workItemType.filter((value) => value !== type)
                    : [...filters.workItemType, type],
                })
              }
            >
              {WORK_ITEM_TYPE_LABEL[type]}
            </Chip>
          ))}
        </Group>

        {labels.length > 0 && (
          <Group name="标签">
            {labels.map((l) => (
              <Chip
                key={l.id}
                on={filters.label.includes(l.id)}
                onClick={() => toggle("label", l.id)}
              >
                {l.name}
              </Chip>
            ))}
          </Group>
        )}

        {milestones.length > 0 && (
          <Group name="里程碑">
            {[...milestones, { id: "none", name: "无里程碑" }].map((m) => (
              <Chip
                key={m.id}
                on={filters.milestone.includes(m.id)}
                onClick={() => toggle("milestone", m.id)}
              >
                {m.name}
              </Chip>
            ))}
          </Group>
        )}

        <Chip on={filters.overdue} onClick={() => push({ ...filters, overdue: !filters.overdue })}>
          仅看逾期
        </Chip>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <span className="text-xs font-medium text-ink-soft">分组依据</span>
        <select
          value={filters.group}
          onChange={(e) => push({ ...filters, group: e.target.value as GroupBy })}
          className="ac-field w-auto py-1 text-sm"
        >
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
            <option key={g} value={g}>
              {GROUP_LABEL[g]}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-faint">
          显示 {visible} / {total} 个任务
        </span>
        {dirty && (
          <button
            type="button"
            onClick={() =>
              push({
                ...filters,
                assignee: [],
                priority: [],
                label: [],
                milestone: [],
                workItemType: [],
                sprint: "default",
                overdue: false,
              })
            }
            className="text-xs text-ink-faint underline hover:text-primary"
          >
            清空筛选
          </button>
        )}
      </div>
    </div>
  );
}

function Group({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-xs font-medium text-ink-soft">{name}</span>
      {children}
    </span>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`ac-badge transition ${
        on ? "bg-primary text-white" : "bg-surface text-ink-soft hover:bg-primary-soft"
      }`}
    >
      {children}
    </button>
  );
}
