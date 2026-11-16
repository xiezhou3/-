"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Flag, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import {
  createMilestoneAction,
  deleteMilestoneAction,
  setMilestoneStatusAction,
  updateMilestoneAction,
  type FormState,
} from "./actions";

type Milestone = {
  id: string;
  title: string;
  targetDate: string | null;
  status: string;
};

export function MilestoneSection({
  projectId,
  milestones,
  isAdmin,
}: {
  projectId: string;
  milestones: Milestone[];
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createMilestoneAction,
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [, startTransition] = useTransition();

  function run(id: string, task: () => Promise<FormState>) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result?.error) setError(result.error);
      setBusyId(null);
    });
  }

  function toggleStatus(milestone: Milestone) {
    run(milestone.id, () =>
      setMilestoneStatusAction({
        projectId,
        milestoneId: milestone.id,
        status: milestone.status === "done" ? "open" : "done",
      }),
    );
  }

  function startEdit(milestone: Milestone) {
    setEditingId(milestone.id);
    setEditTitle(milestone.title);
    setEditDate(milestone.targetDate ?? "");
  }

  function saveEdit() {
    if (!editingId) return;
    const id = editingId;
    run(id, async () => {
      const result = await updateMilestoneAction({
        projectId,
        milestoneId: id,
        title: editTitle,
        targetDate: editDate || null,
      });
      if (!result?.error) setEditingId(null);
      return result;
    });
  }

  function remove(milestone: Milestone) {
    if (!window.confirm(`删除里程碑「${milestone.title}」？任务会保留，只是不再归属该里程碑。`)) {
      return;
    }
    setEditingId(null);
    run(milestone.id, () =>
      deleteMilestoneAction({ projectId, milestoneId: milestone.id }),
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-soft">
          里程碑
        </h2>
        <span className="text-xs text-ink-faint">{milestones.length}</span>
        {milestones.some((m) => m.status === "done") && (
          <span className="text-xs text-done">
            已完成 {milestones.filter((m) => m.status === "done").length}
          </span>
        )}
      </div>

      <ul className="flex flex-wrap gap-2">
        {milestones.map((milestone) => {
          const done = milestone.status === "done";
          const busy = busyId === milestone.id;

          if (editingId === milestone.id) {
            return (
              <li key={milestone.id} className="ac-card flex flex-wrap items-center gap-2 px-3 py-2">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="ac-field w-52 py-1 text-sm"
                  aria-label="里程碑标题"
                  autoFocus
                />
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="ac-field w-auto py-1 text-sm"
                  aria-label="目标日期"
                />
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={busy}
                  className="ac-btn px-2.5 py-1 text-xs"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="ac-btn-ghost px-2.5 py-1 text-xs"
                  aria-label="取消编辑"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          }

          return (
            <li
              key={milestone.id}
              className={`ac-card flex items-center gap-2 px-3 py-2 ${
                done ? "bg-sunken/60" : ""
              }`}
            >
              <Flag
                className={`h-3.5 w-3.5 shrink-0 ${done ? "text-done" : "text-primary"}`}
                aria-hidden
              />
              <span
                className={`text-sm ${done ? "text-ink-faint line-through" : "text-ink"}`}
              >
                {milestone.title}
              </span>
              {milestone.targetDate && (
                <span className="text-xs tabular-nums text-ink-faint">
                  {milestone.targetDate}
                </span>
              )}
              <span
                className={`ac-badge ${
                  done ? "bg-done/12 text-done" : "bg-sunken text-ink-soft"
                }`}
              >
                {done ? "已完成" : "进行中"}
              </span>

              {isAdmin && (
                <span className="ml-0.5 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleStatus(milestone)}
                    disabled={busy}
                    title={done ? "重开里程碑" : "标记完成"}
                    aria-label={done ? "重开里程碑" : "标记完成"}
                    className="grid h-7 w-7 place-items-center rounded-field text-ink-faint transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-50"
                  >
                    {done ? (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(milestone)}
                    title="编辑里程碑"
                    aria-label="编辑里程碑"
                    className="grid h-7 w-7 place-items-center rounded-field text-ink-faint transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(milestone)}
                    disabled={busy}
                    title="删除里程碑"
                    aria-label="删除里程碑"
                    className="grid h-7 w-7 place-items-center rounded-field text-ink-faint transition-colors hover:bg-high-soft hover:text-high disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              )}
            </li>
          );
        })}

        {milestones.length === 0 && (
          <li className="text-sm text-ink-soft">
            还没有里程碑——先把项目拆成 3 到 4 个阶段目标。
          </li>
        )}
      </ul>

      {isAdmin && (
        <form action={formAction} className="flex flex-wrap items-center gap-2 pt-1">
          <input type="hidden" name="projectId" value={projectId} />
          <input
            name="title"
            placeholder="新里程碑，如：需求调研完成"
            className="ac-field w-64 py-1.5 text-sm"
          />
          <input
            type="date"
            name="targetDate"
            className="ac-field w-auto py-1.5 text-sm"
            aria-label="目标日期"
          />
          <button disabled={pending} className="ac-btn px-3 py-1.5 text-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {pending ? "添加中…" : "添加"}
          </button>
          {state?.error && <p className="text-sm text-high">{state.error}</p>}
        </form>
      )}

      {error && <p className="text-sm text-high">{error}</p>}
    </section>
  );
}
