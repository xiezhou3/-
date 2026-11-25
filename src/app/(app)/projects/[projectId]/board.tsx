"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  deriveColumns,
  supportsTaskCreation,
  type BoardColumn,
} from "@/lib/board-columns";
import type { GroupBy } from "@/lib/board-filters";
import type { WorkItemTypeValue } from "@/lib/work-item";
import {
  TaskCard,
  type Option,
} from "./task-card";
import { TaskCreateDialog } from "./task-create-dialog";
import { batchUpdateTasksAction } from "./actions";

export type BoardTask = {
  id: string;
  taskNumber: number | null;
  title: string;
  description: string | null;
  completionNote: string | null;
  status: "todo" | "doing" | "done";
  statusId: string | null;
  priority: string;
  workItemType: WorkItemTypeValue;
  bugSeverity: "blocker" | "critical" | "major" | "minor" | null;
  parentWorkItemId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimate: number | null;
  estimatedHours: number | null;
  actualHours: number;
  sprintId: string | null;
  releaseId: string | null;
  assigneeName: string | null;
  assigneeId: string | null;
  assigneeIds: string[];
  assignees: { id: string; name: string }[];
  attachments: {
    id: string;
    projectFileId: string | null;
    name: string;
    url: string;
    createdById: string | null;
    createdByName: string | null;
    createdAt: Date | string;
  }[];
  milestoneId: string | null;
  labels: { id: string; name: string; color: string }[];
  commentCount: number;
  mentioned: boolean;
};

function Column({
  column,
  tasks,
  projectId,
  canEdit,
  currentUserId,
  isAdmin,
  members,
  milestones,
  allTasks,
  allLabels,
  dependencies,
  sprints,
  releases,
  workflowStatuses,
  transitions,
  selectedIds,
  onToggleSelected,
  onAdd,
  focusTaskId,
}: {
  column: BoardColumn;
  tasks: BoardTask[];
  projectId: string;
  canEdit: boolean;
  currentUserId: string;
  isAdmin: boolean;
  members: Option[];
  milestones: Option[];
  allTasks: WorkItemOption[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
  sprints: SprintOption[];
  releases: ReleaseOption[];
  workflowStatuses: WorkflowStatusOption[];
  transitions: { fromStatusId: string; toStatusId: string }[];
  selectedIds: Set<string>;
  onToggleSelected: (taskId: string) => void;
  onAdd?: () => void;
  focusTaskId?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusTaskId || !scrollRef.current) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const target = Array.from(container.children).find(
        (child) => child.getAttribute("data-task-id") === focusTaskId,
      ) as HTMLElement | undefined;
      if (target) {
        container.scrollTo({
          top: target.offsetTop - container.offsetTop,
          behavior: "smooth",
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTaskId, tasks.length]);

  return (
    <div
      className="flex h-[min(62dvh,42rem)] min-h-[27rem] w-[20rem] shrink-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-sunken/45 px-3 py-3">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${column.tone}`}>
          <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
          {column.label}
          <span className="ac-badge bg-surface text-ink-soft">{tasks.length}</span>
          {column.wipLimit !== null && column.wipLimit !== undefined && (
            <span
              className={`text-[11px] font-normal ${
                (column.taskCount ?? tasks.length) > column.wipLimit
                  ? "text-high"
                  : "text-ink-faint"
              }`}
            >
              WIP {column.taskCount ?? tasks.length}/{column.wipLimit}
            </span>
          )}
        </h3>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="grid h-7 w-7 place-items-center rounded-field text-ink-faint transition-colors hover:bg-surface hover:text-primary"
            aria-label={`在${column.label}中添加任务`}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="ac-scrollbar min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3"
        aria-label={`${column.label}任务列表`}
      >
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            projectId={projectId}
            canEdit={canEdit}
            canSubmit={isAdmin || t.assigneeIds.includes(currentUserId)}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            members={members}
            milestones={milestones}
            allTasks={allTasks}
            allLabels={allLabels}
            dependencies={dependencies}
            sprints={sprints}
            releases={releases}
            workflowStatuses={workflowStatuses}
            transitions={transitions}
            selected={selectedIds.has(t.id)}
            onToggleSelected={() => onToggleSelected(t.id)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-sunken/30 px-4 text-center">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-surface text-ink-faint shadow-sm">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            <p className="mt-2 text-xs text-ink-faint">暂无任务</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function Board({
  projectId,
  tasks,
  groupBy,
  canWrite,
  canEdit,
  currentUserId,
  isAdmin,
  members,
  milestones,
  allTasks,
  allLabels,
  dependencies,
  sprints,
  releases,
  workflowStatuses,
  transitions,
  defaultSprintId,
}: {
  projectId: string;
  tasks: BoardTask[];
  groupBy: GroupBy;
  canWrite: boolean;
  canEdit: boolean;
  currentUserId: string;
  isAdmin: boolean;
  members: Option[];
  milestones: Option[];
  allTasks: WorkItemOption[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
  sprints: SprintOption[];
  releases: ReleaseOption[];
  workflowStatuses: WorkflowStatusOption[];
  transitions: { fromStatusId: string; toStatusId: string }[];
  defaultSprintId: string | null;
}) {
  const router = useRouter();
  const [createColumn, setCreateColumn] = useState<BoardColumn | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusId, setBulkStatusId] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkPending, startBulk] = useTransition();
  const [optimisticTasks, addOptimisticTask] = useOptimistic<BoardTask[], BoardTask>(
    tasks,
    (current, task) => [...current, task],
  );

  const columns = deriveColumns(groupBy, {
    members,
    milestones,
    statuses: workflowStatuses,
  });

  return (
    <>
      {canWrite && selectedIds.size > 0 && (
        <div className="mb-3 space-y-2 rounded-card border border-primary-ring bg-primary-soft/55 p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-primary">
              已选 {selectedIds.size} 项
            </span>
            <select
              value={bulkStatusId}
              onChange={(event) => setBulkStatusId(event.target.value)}
              className="ac-field w-auto py-1 text-sm"
              aria-label="批量设置状态"
            >
              <option value="">状态不变</option>
              {workflowStatuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
            <select
              value={bulkPriority}
              onChange={(event) => setBulkPriority(event.target.value)}
              className="ac-field w-auto py-1 text-sm"
              aria-label="批量设置优先级"
            >
              <option value="">优先级不变</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
            <select
              value={bulkAssignee}
              onChange={(event) => setBulkAssignee(event.target.value)}
              className="ac-field w-auto py-1 text-sm"
              aria-label="批量设置负责人"
            >
              <option value="">负责人不变</option>
              <option value="__clear">清空负责人</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ac-btn"
              disabled={
                bulkPending ||
                (!bulkStatusId && !bulkPriority && !bulkAssignee)
              }
              onClick={() => {
                setBulkError("");
                startBulk(async () => {
                  const result = await batchUpdateTasksAction({
                    projectId,
                    taskIds: [...selectedIds],
                    statusId: bulkStatusId || undefined,
                    priority:
                      (bulkPriority as "low" | "medium" | "high") ||
                      undefined,
                    assigneeIds:
                      bulkAssignee === "__clear"
                        ? []
                        : bulkAssignee
                          ? [bulkAssignee]
                          : undefined,
                  });
                  if (result && "error" in result) {
                    setBulkError(result.error);
                    return;
                  }
                  setSelectedIds(new Set());
                  setBulkStatusId("");
                  setBulkPriority("");
                  setBulkAssignee("");
                  router.refresh();
                });
              }}
            >
              {bulkPending ? "应用中…" : "应用批量修改"}
            </button>
            <button
              type="button"
              className="text-xs text-ink-faint underline"
              onClick={() => setSelectedIds(new Set())}
            >
              清除选择
            </button>
          </div>
          {bulkError && <p className="text-sm text-high">{bulkError}</p>}
        </div>
      )}
      {/* 列数随分组维度而变，故横向滚动而非固定三栏 */}
      <div className="ac-scrollbar flex gap-3 overflow-x-auto pb-3">
        {columns.map((col) => (
          <Column
            key={col.key}
            column={col}
            tasks={optimisticTasks.filter((t) => col.matches(t))}
            projectId={projectId}
            canEdit={canEdit}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            members={members}
            milestones={milestones}
            allTasks={allTasks}
            allLabels={allLabels}
            dependencies={dependencies}
            sprints={sprints}
            releases={releases}
            workflowStatuses={workflowStatuses}
            transitions={transitions}
            selectedIds={selectedIds}
            onToggleSelected={(taskId) =>
              setSelectedIds((current) => {
                const next = new Set(current);
                if (next.has(taskId)) next.delete(taskId);
                else next.add(taskId);
                return next;
              })
            }
            focusTaskId={focusTaskId}
            onAdd={
              canWrite && supportsTaskCreation(col)
                ? () => setCreateColumn(col)
                : undefined
            }
          />
        ))}
      </div>
      {createColumn && canWrite && (
        <TaskCreateDialog
          projectId={projectId}
          status={createColumn.patch.status ?? "todo"}
          statusId={createColumn.patch.statusId ?? ""}
          statusLabel={createColumn.label}
          members={members}
          milestones={milestones}
          sprints={sprints}
          releases={releases}
          allTasks={allTasks}
          defaultSprintId={defaultSprintId}
          onClose={() => setCreateColumn(null)}
          onCreated={(task) => {
            addOptimisticTask(task);
            setFocusTaskId(task.id);
            setCreateColumn(null);
          }}
        />
      )}
    </>
  );
}

export type SprintOption = {
  id: string;
  name: string;
  status: "planned" | "active" | "closed";
};

export type ReleaseOption = {
  id: string;
  name: string;
  status: "planned" | "active" | "released" | "cancelled";
};

export type WorkItemOption = {
  id: string;
  title: string;
  workItemType: WorkItemTypeValue;
};

export type WorkflowStatusOption = {
  id: string;
  name: string;
  category: "todo" | "doing" | "done";
  color: string;
  position: number;
  wipLimit: number | null;
  taskCount: number;
};
