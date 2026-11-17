"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  UserRound,
} from "lucide-react";
import { LABEL_COLOR_CLASS } from "@/lib/board-columns";
import {
  WORK_ITEM_TYPE_BADGE,
  WORK_ITEM_TYPE_LABEL,
  type WorkItemTypeValue,
} from "@/lib/work-item";
import {
  createBacklogTaskAction,
  reorderBacklogAction,
} from "./actions";

type BacklogStatus = "todo" | "doing" | "done";
type SprintStatus = "planned" | "active" | "closed";

type BacklogTask = {
  id: string;
  title: string;
  status: BacklogStatus;
  priority: string;
  workItemType: WorkItemTypeValue;
  parentTitle: string | null;
  estimate: number | null;
  assigneeName: string | null;
  labels: { id: string; name: string; color: string }[];
};

type SprintOption = {
  id: string;
  name: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  capacity: number;
  estimateTotal: number;
  unestimatedTaskCount: number;
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-high-soft text-high",
  medium: "bg-medium-soft text-medium",
  low: "bg-low-soft text-low",
};

function taskPoints(tasks: BacklogTask[]) {
  return tasks.reduce((total, task) => total + (task.estimate ?? 0), 0);
}

function unestimatedCount(tasks: BacklogTask[]) {
  return tasks.filter((task) => task.estimate === null).length;
}

export function BacklogWorkspace({
  projectId,
  canWrite,
  sprints,
  selectedSprintId,
  backlogTasks,
  sprintTasks,
}: {
  projectId: string;
  canWrite: boolean;
  sprints: SprintOption[];
  selectedSprintId: string | null;
  backlogTasks: BacklogTask[];
  sprintTasks: BacklogTask[];
}) {
  const router = useRouter();
  const [backlog, setBacklog] = useState(backlogTasks);
  const [sprint, setSprint] = useState(sprintTasks);
  const [activeTask, setActiveTask] = useState<BacklogTask | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedSprint =
    sprints.find((item) => item.id === selectedSprintId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function findContainer(id: string | number): "backlog" | "sprint" | null {
    if (id === "backlog-dropzone") return "backlog";
    if (id === "sprint-dropzone") return "sprint";
    if (backlog.some((task) => task.id === id)) return "backlog";
    if (sprint.some((task) => task.id === id)) return "sprint";
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const task =
      backlog.find((item) => item.id === event.active.id) ??
      sprint.find((item) => item.id === event.active.id) ??
      null;
    setActiveTask(task);
    setError("");
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    if (!event.over || !selectedSprint || !canWrite) return;

    const from = findContainer(event.active.id);
    const to = findContainer(event.over.id);
    if (!from || !to) return;

    const previousBacklog = backlog;
    const previousSprint = sprint;
    let nextBacklog = backlog;
    let nextSprint = sprint;

    if (from === to) {
      const list = from === "backlog" ? backlog : sprint;
      const oldIndex = list.findIndex((task) => task.id === event.active.id);
      const overIndex = list.findIndex((task) => task.id === event.over!.id);
      if (oldIndex < 0) return;
      const newIndex =
        overIndex >= 0
          ? overIndex
          : event.over!.id === `${from}-dropzone`
            ? list.length - 1
            : oldIndex;
      if (oldIndex === newIndex) return;
      const moved = arrayMove(list, oldIndex, newIndex);
      if (from === "backlog") nextBacklog = moved;
      else nextSprint = moved;
    } else {
      const source = from === "backlog" ? backlog : sprint;
      const target = to === "backlog" ? backlog : sprint;
      const oldIndex = source.findIndex((task) => task.id === event.active.id);
      if (oldIndex < 0) return;
      const task = source[oldIndex];
      const nextSource = source.filter((item) => item.id !== task.id);
      const overIndex = target.findIndex((item) => item.id === event.over!.id);
      const targetWithTask = [...target];
      targetWithTask.splice(
        overIndex >= 0 ? overIndex : target.length,
        0,
        task,
      );
      if (from === "backlog") {
        nextBacklog = nextSource;
        nextSprint = targetWithTask;
      } else {
        nextSprint = nextSource;
        nextBacklog = targetWithTask;
      }
    }

    setBacklog(nextBacklog);
    setSprint(nextSprint);
    startTransition(async () => {
      const result = await reorderBacklogAction({
        projectId,
        sprintId: selectedSprint.id,
        backlogTaskIds: nextBacklog.map((task) => task.id),
        sprintTaskIds: nextSprint.map((task) => task.id),
      });
      if (!result.ok) {
        setBacklog(previousBacklog);
        setSprint(previousSprint);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function createTask() {
    const value = title.trim();
    if (!value || pending) return;
    setError("");
    startTransition(async () => {
      const result = await createBacklogTaskAction({
        projectId,
        title: value,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const taskId = result.taskId;
      if (taskId) {
        setBacklog((current) => [
          ...current,
          {
            id: taskId,
            title: value,
            status: "todo",
            priority: "medium",
            workItemType: "task",
            parentTitle: null,
            estimate: null,
            assigneeName: null,
            labels: [],
          },
        ]);
      }
      setTitle("");
      router.refresh();
    });
  }

  function switchSprint(sprintId: string) {
    setError("");
    router.replace(`/projects/${projectId}/backlog?sprint=${sprintId}`);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveTask(null)}
      onDragEnd={handleDragEnd}
    >
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-card border border-line bg-surface p-3">
          <div>
            <p className="text-xs font-medium text-ink-soft">当前规划范围</p>
            <p className="mt-1 text-sm text-ink">
              {sprints.length > 0
                ? "选择计划中或进行中的 Sprint"
                : "尚无可用 Sprint，请先创建迭代"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSprintId ?? ""}
              onChange={(event) => switchSprint(event.target.value)}
              disabled={sprints.length === 0}
              className="ac-field w-auto min-w-56"
              aria-label="选择 Sprint Backlog"
            >
              {sprints.length === 0 ? (
                <option value="">暂无 Sprint</option>
              ) : (
                sprints.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.status === "active" ? "进行中" : "计划中"}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {error && (
          <p className="rounded-field bg-high-soft px-3 py-2 text-sm text-high">
            {error}
          </p>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <BacklogColumn
            id="backlog-dropzone"
            kind="backlog"
            projectId={projectId}
            canWrite={canWrite}
            tasks={backlog}
            title="产品 Backlog"
            description="未规划任务，顺序会持久保存"
            points={taskPoints(backlog)}
            unestimated={unestimatedCount(backlog)}
            quickAdd={
              canWrite ? (
                <div className="flex gap-2">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        createTask();
                      }
                    }}
                    placeholder="输入标题，快速加入 Backlog"
                    className="ac-field min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={createTask}
                    disabled={pending || !title.trim()}
                    className="ac-btn shrink-0"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    添加
                  </button>
                </div>
              ) : null
            }
          />

          <BacklogColumn
            id="sprint-dropzone"
            kind="sprint"
            projectId={projectId}
            canWrite={canWrite}
            tasks={sprint}
            title={selectedSprint?.name ?? "Sprint Backlog"}
            description={
              selectedSprint
                ? `${selectedSprint.startDate} → ${selectedSprint.endDate}`
                : "请先创建或选择一个 Sprint"
            }
            points={taskPoints(sprint)}
            unestimated={unestimatedCount(sprint)}
            capacity={selectedSprint?.capacity}
            emptyText={
              selectedSprint
                ? "把左侧任务拖到这里，形成 Sprint Backlog。"
                : "暂无计划中或进行中的 Sprint。"
            }
          />
        </div>
      </section>

      <DragOverlay>
        {activeTask ? (
          <div className="w-[min(32rem,90vw)] rotate-1 opacity-95">
            <TaskRowContent task={activeTask} kind="overlay" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BacklogColumn({
  id,
  kind,
  projectId,
  canWrite,
  tasks,
  title,
  description,
  points,
  unestimated,
  capacity,
  quickAdd,
  emptyText,
}: {
  id: string;
  kind: "backlog" | "sprint";
  projectId: string;
  canWrite: boolean;
  tasks: BacklogTask[];
  title: string;
  description: string;
  points: number;
  unestimated: number;
  capacity?: number;
  quickAdd?: React.ReactNode;
  emptyText?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section className="min-w-0 rounded-card border border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 text-xs text-ink-faint">{description}</p>
          </div>
          <span className="ac-badge shrink-0 bg-sunken text-ink-soft">
            {tasks.length} 项
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          <span>{points} 故事点</span>
          {unestimated > 0 && <span className="text-medium">{unestimated} 项未估算</span>}
          {kind === "sprint" && capacity !== undefined && (
            <span className={points > capacity ? "font-medium text-high" : "text-ink-faint"}>
              容量 {capacity}
            </span>
          )}
        </div>
        {quickAdd && <div className="mt-3">{quickAdd}</div>}
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-72 p-3 transition-colors ${
          isOver ? "bg-primary-soft/60" : "bg-sunken/35"
        }`}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {tasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                projectId={projectId}
                kind={kind}
                canWrite={canWrite}
              />
            ))}
            {tasks.length === 0 && (
              <div className="grid min-h-48 place-items-center rounded-field border border-dashed border-line-strong px-5 text-center text-sm text-ink-faint">
                {emptyText ?? (kind === "backlog" ? "产品 Backlog 为空。" : "该 Sprint 还没有任务。")}
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}

function SortableTaskRow({
  task,
  projectId,
  kind,
  canWrite,
}: {
  task: BacklogTask;
  projectId: string;
  kind: "backlog" | "sprint";
  canWrite: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !canWrite,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "opacity-35" : undefined}
    >
      <TaskRowContent
        task={task}
        projectId={projectId}
        kind={kind}
        dragHandle={
          canWrite ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="grid h-8 w-7 shrink-0 cursor-grab place-items-center rounded text-ink-faint hover:bg-sunken hover:text-primary active:cursor-grabbing"
              style={{ touchAction: "none" }}
              aria-label={`拖拽 ${task.title}`}
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </button>
          ) : null
        }
      />
    </div>
  );
}

function TaskRowContent({
  task,
  projectId,
  kind,
  dragHandle,
}: {
  task: BacklogTask;
  projectId?: string;
  kind: "backlog" | "sprint" | "overlay";
  dragHandle?: React.ReactNode;
}) {
  const content = (
    <>
      {dragHandle}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`ac-badge shrink-0 ${WORK_ITEM_TYPE_BADGE[task.workItemType]}`}>
            {WORK_ITEM_TYPE_LABEL[task.workItemType]}
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {task.title}
          </p>
          <span className={`ac-badge shrink-0 ${PRIORITY_BADGE[task.priority] ?? "bg-low-soft text-low"}`}>
            {task.priority}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" aria-hidden />
            {task.assigneeName ?? "未分配"}
          </span>
          <span>{task.estimate === null ? "未估算" : `${task.estimate} SP`}</span>
          <span>{kind === "backlog" ? "未规划" : "已规划"}</span>
          {task.parentTitle && <span>上级：{task.parentTitle}</span>}
          {task.labels.slice(0, 2).map((label) => (
            <span
              key={label.id}
              className={`ac-badge ${LABEL_COLOR_CLASS[label.color] ?? LABEL_COLOR_CLASS.slate}`}
            >
              {label.name}
            </span>
          ))}
        </div>
      </div>
      {projectId && (
        <Link
          href={`/projects/${projectId}?task=${task.id}&sprint=all`}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          编辑
        </Link>
      )}
    </>
  );

  return (
    <div className="flex items-center gap-2 rounded-field border border-line bg-surface px-2.5 py-2 shadow-sm">
      {content}
    </div>
  );
}
