"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  DragOverlay,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Inbox, Plus } from "lucide-react";
import {
  deriveColumns,
  supportsTaskCreation,
  type BoardColumn,
  type ColumnPatch,
} from "@/lib/board-columns";
import type { GroupBy } from "@/lib/board-filters";
import { moveTaskAction } from "./actions";
import {
  TaskCard,
  TaskCardContent,
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
  milestoneId: string | null;
  labels: { id: string; name: string; color: string }[];
};

function Column({
  column,
  tasks,
  projectId,
  canWrite,
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
  canWrite: boolean;
  members: Option[];
  milestones: Option[];
  allTasks: { id: string; title: string }[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
  onAdd?: () => void;
  focusTaskId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
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
      ref={setNodeRef}
      className={`ac-board-column flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all ${
        isOver
          ? "border-primary-ring bg-primary-soft/75 shadow-pop"
          : "border-line bg-sunken"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/80 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full bg-current ${column.tone}`}
          />
          <h3 className={`truncate text-sm font-semibold ${column.tone}`}>
            {column.label}
          </h3>
          <span className="ac-badge min-w-6 justify-center bg-surface text-ink-soft">
            {tasks.length}
          </span>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-field text-ink-faint transition-colors hover:bg-surface hover:text-primary"
            aria-label={`在${column.label}中添加任务`}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="ac-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
        aria-label={`${column.label}任务列表`}
      >
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            projectId={projectId}
            canWrite={canWrite}
            members={members}
            milestones={milestones}
            allTasks={allTasks}
            allLabels={allLabels}
            dependencies={dependencies}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-4 text-center">
            <Inbox className="h-5 w-5 text-ink-faint" aria-hidden />
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
  members: Option[];
  milestones: Option[];
  allTasks: { id: string; title: string }[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
}) {
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createStatus, setCreateStatus] = useState<
    "todo" | "doing" | "done" | null
  >(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [optimisticTasks, updateOptimistic] = useOptimistic<
    BoardTask[],
    | { type: "move"; taskId: string; patch: ColumnPatch }
    | { type: "add"; task: BoardTask }
  >(
    tasks,
    (current, action) =>
      action.type === "add"
        ? [...current, action.task]
        : current.map((task) =>
            task.id === action.taskId ? { ...task, ...action.patch } : task,
          ),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const columns = deriveColumns(groupBy, { members, milestones });
  const activeTask = activeTaskId
    ? optimisticTasks.find((task) => task.id === activeTaskId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    const taskId = String(event.active.id);
    const over = event.over?.id;
    if (!over) return;
    const column = columns.find((c) => c.key === String(over));
    const task = optimisticTasks.find((t) => t.id === taskId);
    // 已在目标列则无须提交
    if (!column || !task || column.matches(task)) return;

    startTransition(async () => {
      setError(null);
      updateOptimistic({ type: "move", taskId, patch: column.patch });
      const res = await moveTaskAction({ taskId, projectId, patch: column.patch });
      if (res?.error) setError(res.error);
    });
  }

  function handleDragCancel() {
    setActiveTaskId(null);
  }

  return (
    <DndContext
      id={`board-${projectId}`}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {error && (
        <div className="mb-3 rounded-field border border-high/30 bg-high-soft px-3 py-2 text-sm text-high">
          {error}
        </div>
      )}
      {/* 列数随分组维度而变，故横向滚动而非固定三栏 */}
      <div
        className="ac-scrollbar grid min-w-full gap-3 overflow-x-auto pb-3 sm:gap-4"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(18.5rem, 27rem))`,
        }}
      >
        {columns.map((col) => (
          <Column
            key={col.key}
            column={col}
            tasks={optimisticTasks.filter((t) => col.matches(t))}
            projectId={projectId}
            canWrite={canWrite}
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
            updateOptimistic({ type: "add", task });
            setFocusTaskId(task.id);
            setCreateStatus(null);
          }}
        />
      )}
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCardOverlay
            task={activeTask}
            dependencies={dependencies}
            allTasks={allTasks}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function TaskCardOverlay({
  task,
  dependencies,
  allTasks,
}: {
  task: BoardTask;
  dependencies: { predecessorId: string; successorId: string }[];
  allTasks: { id: string; title: string }[];
}) {
  const successorTitles = dependencies
    .filter((dependency) => dependency.predecessorId === task.id)
    .map(
      (dependency) =>
        allTasks.find((candidate) => candidate.id === dependency.successorId)
          ?.title,
    )
    .filter((title): title is string => Boolean(title));

  return (
    <div className="ac-card w-[19rem] rotate-1 p-3 text-sm shadow-pop ring-1 ring-primary-ring">
      <TaskCardContent task={task} successorTitles={successorTitles} />
    </div>
  );
}
