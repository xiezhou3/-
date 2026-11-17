"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  createWorkflowStatusAction,
  deleteWorkflowStatusAction,
  reorderWorkflowStatusesAction,
  saveWorkflowTransitionsAction,
  updateWorkflowStatusAction,
  type WorkflowActionState,
} from "./actions";

type StatusCategory = "todo" | "doing" | "done";

type StatusView = {
  id: string;
  name: string;
  category: StatusCategory;
  color: string;
  position: number;
  wipLimit: number | null;
  isDefault: boolean;
  taskCount: number;
};

const CATEGORY_LABEL: Record<StatusCategory, string> = {
  todo: "未开始",
  doing: "进行中",
  done: "已完成",
};

const COLOR_OPTIONS = [
  ["slate", "灰"],
  ["blue", "蓝"],
  ["amber", "琥珀"],
  ["green", "绿"],
  ["red", "红"],
  ["violet", "紫"],
  ["pink", "粉"],
] as const;

const COLOR_DOT: Record<string, string> = {
  slate: "bg-todo",
  blue: "bg-doing",
  amber: "bg-medium",
  green: "bg-done",
  red: "bg-high",
  violet: "bg-primary",
  pink: "bg-accent",
};

function stateError(state: WorkflowActionState) {
  return state && !state.ok ? state.error : "";
}

export function WorkflowManager({
  projectId,
  isAdmin,
  statuses,
  transitions,
}: {
  projectId: string;
  isAdmin: boolean;
  statuses: StatusView[];
  transitions: { fromStatusId: string; toStatusId: string }[];
}) {
  const router = useRouter();
  const [createState, createAction, creating] = useActionState<
    WorkflowActionState,
    FormData
  >(createWorkflowStatusAction, null);
  const [editing, setEditing] = useState<StatusView | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [allowed, setAllowed] = useState(
    () =>
      new Set(
        transitions.map(
          (item) => `${item.fromStatusId}:${item.toStatusId}`,
        ),
      ),
  );

  function refresh(result: WorkflowActionState) {
    if (!result?.ok) {
      if (result) setError(result.error);
      return false;
    }
    setError("");
    router.refresh();
    return true;
  }

  function move(statusId: string, direction: -1 | 1) {
    const index = statuses.findIndex((status) => status.id === statusId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= statuses.length) return;
    const ordered = [...statuses];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    startTransition(async () => {
      refresh(
        await reorderWorkflowStatusesAction({
          projectId,
          orderedIds: ordered.map((status) => status.id),
        }),
      );
    });
  }

  return (
    <>
      {error && (
        <p className="rounded-field bg-high-soft px-3 py-2 text-sm text-high">
          {error}
        </p>
      )}

      {isAdmin && (
        <section className="ac-card p-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="font-medium text-ink">新建状态</h2>
          </div>
          <form action={createAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={projectId} />
            <Field label="名称">
              <input name="name" className="ac-field" placeholder="例如：开发中" required />
            </Field>
            <Field label="类别">
              <select name="category" className="ac-field" defaultValue="doing">
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="颜色">
              <select name="color" className="ac-field" defaultValue="blue">
                {COLOR_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="WIP 上限（留空不限）">
              <input name="wipLimit" type="number" min={1} className="ac-field" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <button disabled={creating} className="ac-btn">
                {creating ? "创建中…" : "创建状态"}
              </button>
            </div>
            {stateError(createState) && (
              <p className="text-sm text-high sm:col-span-2">{stateError(createState)}</p>
            )}
          </form>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between border-b border-line pb-2">
          <h2 className="font-display text-lg font-semibold text-ink">看板列</h2>
          <p className="text-xs text-ink-faint">按列表顺序渲染看板列</p>
        </div>
        <div className="space-y-2">
          {statuses.map((status, index) => (
            <article
              key={status.id}
              className="flex flex-wrap items-center gap-3 rounded-field border border-line bg-surface p-3"
            >
              <span className={`h-3 w-3 rounded-full ${COLOR_DOT[status.color] ?? "bg-todo"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{status.name}</span>
                  <span className="ac-badge bg-sunken text-ink-soft">
                    {CATEGORY_LABEL[status.category]}
                  </span>
                  {status.isDefault && (
                    <span className="ac-badge bg-primary-soft text-primary">默认</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {status.taskCount} 个任务
                  {status.wipLimit !== null ? ` · WIP ${status.wipLimit}` : " · WIP 不限"}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(status.id, -1)}
                    disabled={pending || index === 0}
                    className="grid h-8 w-8 place-items-center rounded-field text-ink-faint hover:bg-sunken disabled:opacity-30"
                    aria-label={`上移 ${status.name}`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(status.id, 1)}
                    disabled={pending || index === statuses.length - 1}
                    className="grid h-8 w-8 place-items-center rounded-field text-ink-faint hover:bg-sunken disabled:opacity-30"
                    aria-label={`下移 ${status.name}`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(status)}
                    className="grid h-8 w-8 place-items-center rounded-field text-ink-faint hover:bg-sunken"
                    aria-label={`编辑 ${status.name}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={status.isDefault || status.taskCount > 0}
                    onClick={() => {
                      if (!confirm(`删除状态“${status.name}”？`)) return;
                      startTransition(async () => {
                        refresh(
                          await deleteWorkflowStatusAction({
                            projectId,
                            statusId: status.id,
                          }),
                        );
                      });
                    }}
                    className="grid h-8 w-8 place-items-center rounded-field text-high hover:bg-sunken disabled:opacity-30"
                    aria-label={`删除 ${status.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="ac-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              状态流转规则
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              行是当前状态，列是允许进入的目标状态。
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="ac-btn"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  refresh(
                    await saveWorkflowTransitionsAction({
                      projectId,
                      pairs: [...allowed].map((key) => {
                        const [fromStatusId, toStatusId] = key.split(":");
                        return { fromStatusId, toStatusId };
                      }),
                    }),
                  );
                });
              }}
            >
              <Check className="h-4 w-4" aria-hidden />
              保存规则
            </button>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="p-2 text-left text-ink-faint">从 \ 到</th>
                {statuses.map((status) => (
                  <th key={status.id} className="p-2 text-center font-medium text-ink-soft">
                    {status.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statuses.map((from) => (
                <tr key={from.id} className="border-t border-line">
                  <th className="p-2 text-left font-medium text-ink-soft">{from.name}</th>
                  {statuses.map((to) => {
                    const key = `${from.id}:${to.id}`;
                    const disabled = from.id === to.id || !isAdmin;
                    return (
                      <td key={to.id} className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={from.id === to.id || allowed.has(key)}
                          disabled={disabled}
                          onChange={() =>
                            setAllowed((current) => {
                              const next = new Set(current);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                          aria-label={`${from.name} 到 ${to.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EditStatusDialog
          projectId={projectId}
          status={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditStatusDialog({
  projectId,
  status,
  onClose,
}: {
  projectId: string;
  status: StatusView;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<WorkflowActionState, FormData>(
    updateWorkflowStatusAction,
    null,
  );
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-ink/45" aria-label="关闭" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`编辑状态 ${status.name}`}
        className="relative z-10 w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-pop"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">编辑状态</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-field text-ink-faint hover:bg-sunken"
            aria-label="关闭"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <form action={action} className="space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="statusId" value={status.id} />
          <Field label="名称">
            <input name="name" defaultValue={status.name} className="ac-field" required />
          </Field>
          <Field label="类别">
            <select name="category" defaultValue={status.category} className="ac-field">
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="颜色">
            <select name="color" defaultValue={status.color} className="ac-field">
              {COLOR_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="WIP 上限">
            <input
              name="wipLimit"
              type="number"
              min={1}
              defaultValue={status.wipLimit ?? ""}
              className="ac-field"
              placeholder="留空不限"
            />
          </Field>
          {stateError(state) && <p className="text-sm text-high">{stateError(state)}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" onClick={onClose} className="ac-btn-ghost">取消</button>
            <button disabled={pending} className="ac-btn">
              {pending ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </section>
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
