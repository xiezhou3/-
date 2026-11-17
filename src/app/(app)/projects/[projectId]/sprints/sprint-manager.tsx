"use client";

import {
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  Pencil,
  Play,
  Plus,
  Target,
  X,
} from "lucide-react";
import {
  WORK_ITEM_TYPE_BADGE,
  WORK_ITEM_TYPE_LABEL,
  type WorkItemTypeValue,
} from "@/lib/work-item";
import {
  assignTasksToSprintAction,
  closeSprintAction,
  createSprintAction,
  startSprintAction,
  updateSprintAction,
  type SprintActionState,
} from "./actions";

type SprintStatus = "planned" | "active" | "closed";

type SprintView = {
  id: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
  status: SprintStatus;
  taskCount: number;
  doneTaskCount: number;
  estimateTotal: number;
  completedEstimate: number;
  unestimatedTaskCount: number;
};

type TaskView = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  priority: string;
  workItemType: WorkItemTypeValue;
  estimate: number | null;
  sprintId: string | null;
  assigneeName: string | null;
};

const STATUS_META: Record<
  SprintStatus,
  { label: string; className: string }
> = {
  active: { label: "进行中", className: "bg-primary-soft text-primary" },
  planned: { label: "计划中", className: "bg-medium-soft text-medium" },
  closed: { label: "已关闭", className: "bg-sunken text-ink-soft" },
};

function errorOf(state: SprintActionState) {
  return state && !state.ok ? state.error : "";
}

export function SprintManager({
  projectId,
  canWrite,
  sprints,
  tasks,
}: {
  projectId: string;
  canWrite: boolean;
  sprints: SprintView[];
  tasks: TaskView[];
}) {
  const router = useRouter();
  const [createState, createAction, creating] = useActionState<
    SprintActionState,
    FormData
  >(createSprintAction, null);
  const [editSprintId, setEditSprintId] = useState<string | null>(null);
  const [closeSprintId, setCloseSprintId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();

  const activeSprint = sprints.find((sprint) => sprint.status === "active");
  const plannedSprints = sprints.filter((sprint) => sprint.status === "planned");
  const closedSprints = sprints.filter((sprint) => sprint.status === "closed");
  const editingSprint =
    sprints.find((sprint) => sprint.id === editSprintId) ?? null;
  const closingSprint =
    sprints.find((sprint) => sprint.id === closeSprintId) ?? null;

  function refreshAfter(result: SprintActionState) {
    if (!result?.ok) {
      if (result) setActionError(result.error);
      return false;
    }
    setActionError("");
    router.refresh();
    return true;
  }

  return (
    <>
      {canWrite && (
        <section className="ac-card p-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="font-medium text-ink">新建迭代</h2>
          </div>
          <form action={createAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={projectId} />
            <Field label="名称">
              <input
                name="name"
                className="ac-field"
                placeholder="例如：Sprint 1"
                required
              />
            </Field>
            <Field label="容量（故事点）">
              <input
                name="capacity"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                className="ac-field"
                required
              />
            </Field>
            <Field label="开始日期">
              <input name="startDate" type="date" className="ac-field" required />
            </Field>
            <Field label="结束日期">
              <input name="endDate" type="date" className="ac-field" required />
            </Field>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-ink-soft">迭代目标</span>
              <textarea
                name="goal"
                rows={2}
                className="ac-field resize-y"
                placeholder="本次迭代希望交付什么？"
              />
            </label>
            {errorOf(createState) && (
              <p className="text-sm text-high sm:col-span-2">
                {errorOf(createState)}
              </p>
            )}
            {createState?.ok && (
              <p className="text-sm text-done sm:col-span-2">迭代已创建。</p>
            )}
            <div className="flex justify-end sm:col-span-2">
              <button disabled={creating} className="ac-btn">
                {creating ? "创建中…" : "创建迭代"}
              </button>
            </div>
          </form>
        </section>
      )}

      {actionError && (
        <p className="rounded-field bg-high-soft px-3 py-2 text-sm text-high">
          {actionError}
        </p>
      )}

      <SprintSectionTitle
        title="当前迭代"
        description={
          activeSprint
            ? "当前迭代中的任务会默认出现在项目看板。"
            : "尚未启动迭代。"
        }
      />
      {activeSprint ? (
        <SprintCard
          sprint={activeSprint}
          tasks={tasks.filter((task) => task.sprintId === activeSprint.id)}
          canWrite={canWrite && !pending}
          onEdit={() => setEditSprintId(activeSprint.id)}
          onClose={() => setCloseSprintId(activeSprint.id)}
          onRemoveTask={(taskId) => {
            setActionError("");
            startTransition(async () => {
              const result = await assignTasksToSprintAction({
                projectId,
                sprintId: null,
                taskIds: [taskId],
              });
              refreshAfter(result);
            });
          }}
        />
      ) : (
        <EmptyState text="还没有进行中的迭代。" />
      )}

      <SprintSectionTitle
        title="计划中的迭代"
        description="可提前维护目标、日期、容量和任务范围。"
      />
      {plannedSprints.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {plannedSprints.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              tasks={tasks.filter((task) => task.sprintId === sprint.id)}
              canWrite={canWrite && !pending}
              onEdit={() => setEditSprintId(sprint.id)}
              onStart={() => {
                if (!confirm(`启动“${sprint.name}”？`)) return;
                setActionError("");
                startTransition(async () => {
                  const result = await startSprintAction({
                    projectId,
                    sprintId: sprint.id,
                  });
                  refreshAfter(result);
                });
              }}
              onRemoveTask={(taskId) => {
                setActionError("");
                startTransition(async () => {
                  const result = await assignTasksToSprintAction({
                    projectId,
                    sprintId: null,
                    taskIds: [taskId],
                  });
                  refreshAfter(result);
                });
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState text="暂无计划中的迭代。" />
      )}

      <SprintSectionTitle
        title="迭代历史"
        description="已完成任务保留历史归属；未完成任务在关闭时已转移。"
      />
      {closedSprints.length > 0 ? (
        <div className="space-y-3">
          {closedSprints.map((sprint) => (
            <SprintCard
              key={sprint.id}
              sprint={sprint}
              tasks={[]}
              canWrite={false}
            />
          ))}
        </div>
      ) : (
        <EmptyState text="暂无已关闭的迭代。" />
      )}

      {editingSprint && (
        <EditSprintDialog
          projectId={projectId}
          sprint={editingSprint}
          onClose={() => setEditSprintId(null)}
        />
      )}
      {closingSprint && (
        <CloseSprintDialog
          projectId={projectId}
          sprint={closingSprint}
          targets={plannedSprints}
          onClose={() => setCloseSprintId(null)}
          onResult={(result) => {
            if (refreshAfter(result)) setCloseSprintId(null);
          }}
        />
      )}
    </>
  );
}

function SprintSectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-2">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="text-xs text-ink-faint">{description}</p>
    </div>
  );
}

function SprintCard({
  sprint,
  tasks,
  canWrite,
  onEdit,
  onStart,
  onClose,
  onRemoveTask,
}: {
  sprint: SprintView;
  tasks: TaskView[];
  canWrite: boolean;
  onEdit?: () => void;
  onStart?: () => void;
  onClose?: () => void;
  onRemoveTask?: (taskId: string) => void;
}) {
  const meta = STATUS_META[sprint.status];
  const pct =
    sprint.capacity > 0
      ? Math.round((sprint.estimateTotal / sprint.capacity) * 100)
      : sprint.estimateTotal > 0
        ? 100
        : 0;
  const over = sprint.estimateTotal > sprint.capacity;
  const visibleTasks = tasks.slice(0, 8);

  return (
    <article className="ac-card space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">
              {sprint.name}
            </h3>
            <span className={`ac-badge ${meta.className}`}>{meta.label}</span>
            {over && <span className="ac-badge bg-high-soft text-high">超出容量</span>}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {sprint.startDate} → {sprint.endDate}
          </p>
        </div>
        {canWrite && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {onEdit && (
              <button type="button" onClick={onEdit} className="ac-btn-ghost px-2 py-1 text-xs">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                编辑
              </button>
            )}
            {onStart && (
              <button type="button" onClick={onStart} className="ac-btn px-2 py-1 text-xs">
                <Play className="h-3.5 w-3.5" aria-hidden />
                启动
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="ac-btn-ghost px-2 py-1 text-xs"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                关闭
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-field bg-sunken/70 p-3">
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>{sprint.goal || "尚未设置迭代目标"}</span>
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-soft">
            {sprint.estimateTotal} / {sprint.capacity} 故事点
          </span>
          <span className={over ? "font-medium text-high" : "text-ink-faint"}>
            {sprint.taskCount} 任务 · 完成 {sprint.doneTaskCount}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
          <div
            className={`h-full rounded-full ${over ? "bg-high" : "bg-primary"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        {sprint.unestimatedTaskCount > 0 && (
          <p className="mt-1 text-xs text-medium">
            还有 {sprint.unestimatedTaskCount} 个任务未估算故事点
          </p>
        )}
        {sprint.capacity > 0 && (
          <p className="mt-1 text-xs text-ink-faint">
            已完成 {sprint.completedEstimate} 故事点
          </p>
        )}
      </div>

      {visibleTasks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-soft">迭代任务</p>
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 rounded-field border border-line bg-surface px-2.5 py-1.5 text-xs"
            >
              <span className={`ac-badge shrink-0 ${WORK_ITEM_TYPE_BADGE[task.workItemType]}`}>
                {WORK_ITEM_TYPE_LABEL[task.workItemType]}
              </span>
              <span className="min-w-0 truncate text-ink">{task.title}</span>
              <span className="flex shrink-0 items-center gap-2 text-ink-faint">
                <span>{task.estimate === null ? "未估算" : `${task.estimate} SP`}</span>
                {onRemoveTask && (
                  <button
                    type="button"
                    onClick={() => onRemoveTask(task.id)}
                    className="text-ink-faint hover:text-high"
                    aria-label={`将 ${task.title} 移回 Backlog`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </span>
            </div>
          ))}
          {tasks.length > visibleTasks.length && (
            <p className="text-xs text-ink-faint">
              另有 {tasks.length - visibleTasks.length} 个任务
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function EditSprintDialog({
  projectId,
  sprint,
  onClose,
}: {
  projectId: string;
  sprint: SprintView;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<SprintActionState, FormData>(
    updateSprintAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const active = sprint.status === "active";
  return (
    <Dialog title={`编辑 ${sprint.name}`} onClose={onClose}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="sprintId" value={sprint.id} />
        {active && (
          <>
            <input type="hidden" name="name" value={sprint.name} />
            <input type="hidden" name="startDate" value={sprint.startDate} />
            <input type="hidden" name="endDate" value={sprint.endDate} />
          </>
        )}
        <Field label="名称">
          <input
            name="name"
            defaultValue={sprint.name}
            className="ac-field"
            disabled={active}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期">
            <input
              name="startDate"
              type="date"
              defaultValue={sprint.startDate}
              className="ac-field"
              disabled={active}
              required
            />
          </Field>
          <Field label="结束日期">
            <input
              name="endDate"
              type="date"
              defaultValue={sprint.endDate}
              className="ac-field"
              disabled={active}
              required
            />
          </Field>
        </div>
        <Field label="容量（故事点）">
          <input
            name="capacity"
            type="number"
            min={0}
            step={1}
            defaultValue={sprint.capacity}
            className="ac-field"
            required
          />
        </Field>
        <Field label="迭代目标">
          <textarea
            name="goal"
            rows={3}
            defaultValue={sprint.goal ?? ""}
            className="ac-field resize-y"
          />
        </Field>
        {active && (
          <p className="text-xs text-ink-faint">
            进行中的迭代仅允许修改目标和容量。
          </p>
        )}
        {errorOf(state) && <p className="text-sm text-high">{errorOf(state)}</p>}
        <DialogActions onClose={onClose} pending={pending} submitLabel="保存" />
      </form>
    </Dialog>
  );
}

function CloseSprintDialog({
  projectId,
  sprint,
  targets,
  onClose,
  onResult,
}: {
  projectId: string;
  sprint: SprintView;
  targets: SprintView[];
  onClose: () => void;
  onResult: (state: SprintActionState) => void;
}) {
  const [destination, setDestination] = useState<"backlog" | "sprint">("backlog");
  const [targetSprintId, setTargetSprintId] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog title={`关闭 ${sprint.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">
          已完成任务会保留在本迭代；请选择未完成任务的处理方式。
        </p>
        <label className="flex cursor-pointer items-start gap-2 rounded-field border border-line p-3 text-sm">
          <input
            type="radio"
            name="destination"
            value="backlog"
            checked={destination === "backlog"}
            onChange={() => setDestination("backlog")}
          />
          <span>
            <span className="block font-medium text-ink">退回 Backlog</span>
            <span className="block text-xs text-ink-faint">稍后重新规划。</span>
          </span>
        </label>
        <label
          className={`flex cursor-pointer items-start gap-2 rounded-field border border-line p-3 text-sm ${
            targets.length === 0 ? "opacity-50" : ""
          }`}
        >
          <input
            type="radio"
            name="destination"
            value="sprint"
            checked={destination === "sprint"}
            onChange={() => setDestination("sprint")}
            disabled={targets.length === 0}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">顺延到计划中的迭代</span>
            <select
              value={targetSprintId}
              onChange={(event) => setTargetSprintId(event.target.value)}
              className="ac-field mt-2"
              disabled={targets.length === 0 || destination !== "sprint"}
            >
              {targets.length === 0 ? (
                <option value="">暂无计划中的迭代</option>
              ) : (
                targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))
              )}
            </select>
          </span>
        </label>
        {error && <p className="text-sm text-high">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" onClick={onClose} className="ac-btn-ghost" disabled={pending}>
            取消
          </button>
          <button
            type="button"
            className="ac-btn"
            disabled={pending || (destination === "sprint" && !targetSprintId)}
            onClick={() => {
              setError("");
              startTransition(async () => {
                const result = await closeSprintAction({
                  projectId,
                  sprintId: sprint.id,
                  destination,
                  targetSprintId:
                    destination === "sprint" ? targetSprintId : undefined,
                });
                if (result && !result.ok) {
                  setError(result.error);
                  return;
                }
                onResult(result);
              });
            }}
          >
            {pending ? "关闭中…" : "确认关闭"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
        aria-label="关闭"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg rounded-card border border-line bg-surface p-5 shadow-pop"
      >
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-field text-ink-faint hover:bg-sunken"
            aria-label="关闭"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function DialogActions({
  onClose,
  pending,
  submitLabel,
}: {
  onClose: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-line pt-3">
      <button type="button" onClick={onClose} className="ac-btn-ghost" disabled={pending}>
        取消
      </button>
      <button disabled={pending} className="ac-btn">
        {pending ? "保存中…" : submitLabel}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-card border border-dashed border-line-strong bg-sunken/50 p-5 text-sm text-ink-faint">
      {text}
    </p>
  );
}
