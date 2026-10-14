"use client";

import { useEffect, useOptimistic, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  deriveColumns,
  supportsTaskCreation,
  type BoardColumn,
} from "@/lib/board-columns";
import type { GroupBy } from "@/lib/board-filters";
import {
  TaskCard,
  type Option,
} from "./task-card";
import { TaskCreateDialog } from "./task-create-dialog";

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  completionNote: string | null;
  status: "todo" | "doing" | "done";
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  assigneeName: string | null;
  assigneeId: string | null;
  assigneeIds: string[];
  assignees: { id: string; name: string }[];
  attachments: {
    id: string;
    name: string;
    url: string;
    createdById: string | null;
    createdByName: string | null;
    createdAt: Date | string;
  }[];
  milestoneId: string | null;
  labels: { id: string; name: string; color: string }[];
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
  allTasks: { id: string; title: string }[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
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
      className="flex h-[26rem] w-72 shrink-0 flex-col rounded-xl border border-line bg-sunken p-3"
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${column.tone}`}>
          {column.label}
          <span className="ac-badge bg-surface text-ink-soft">{tasks.length}</span>
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
        className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
        aria-label={`${column.label}任务列表`}
      >
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            projectId={projectId}
            canEdit={canEdit}
            canSubmit={isAdmin || t.assigneeIds.includes(currentUserId)}
            members={members}
            milestones={milestones}
            allTasks={allTasks}
            allLabels={allLabels}
            dependencies={dependencies}
          />
        ))}
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
  allTasks: { id: string; title: string }[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
}) {
  const [createStatus, setCreateStatus] = useState<
    "todo" | "doing" | "done" | null
  >(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [optimisticTasks, addOptimisticTask] = useOptimistic<BoardTask[], BoardTask>(
    tasks,
    (current, task) => [...current, task],
  );

  const columns = deriveColumns(groupBy, { members, milestones });

  return (
    <>
      {/* 列数随分组维度而变，故横向滚动而非固定三栏 */}
      <div className="flex gap-4 overflow-x-auto pb-2">
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
            focusTaskId={focusTaskId}
            onAdd={
              canWrite && supportsTaskCreation(col)
                ? () => setCreateStatus(col.patch.status!)
                : undefined
            }
          />
        ))}
      </div>
      {createStatus && canWrite && (
        <TaskCreateDialog
          projectId={projectId}
          status={createStatus}
          members={members}
          milestones={milestones}
          onClose={() => setCreateStatus(null)}
          onCreated={(task) => {
            addOptimisticTask(task);
            setFocusTaskId(task.id);
            setCreateStatus(null);
          }}
        />
      )}
    </>
  );
}
