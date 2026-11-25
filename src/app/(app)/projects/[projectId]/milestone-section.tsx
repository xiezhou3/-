"use client";

import { useActionState } from "react";
import { CalendarDays, CheckCircle2, CircleDot, Plus, Target } from "lucide-react";
import { createMilestoneAction, type FormState } from "./actions";

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

  return (
    <section className="ac-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-field bg-accent-soft text-accent">
            <Target className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">里程碑</h2>
            <p className="text-[11px] text-ink-faint">
              共 {milestones.length} 个阶段目标
            </p>
          </div>
        </div>
      </div>

      <ul className="ac-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {milestones.map((milestone) => {
          const done = milestone.status === "done";
          return (
            <li
              key={milestone.id}
              className={`flex min-w-48 shrink-0 items-center gap-2 rounded-field border px-3 py-2.5 ${
                done
                  ? "border-done/20 bg-done/8"
                  : "border-line bg-sunken/45"
              }`}
            >
              {done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-done" aria-hidden />
              ) : (
                <CircleDot className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {milestone.title}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
                  <CalendarDays className="h-3 w-3" aria-hidden />
                  {milestone.targetDate ?? "未设日期"}
                </p>
              </div>
            </li>
          );
        })}
        {milestones.length === 0 ? (
          <li className="flex min-h-12 items-center rounded-field border border-dashed border-line-strong px-4 text-xs text-ink-faint">
            暂无里程碑，先为项目设一个阶段目标。
          </li>
        ) : null}
      </ul>

      {isAdmin ? (
        <form
          action={formAction}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input
            name="title"
            placeholder="新里程碑名称"
            className="ac-field min-w-48 flex-1 text-sm"
          />
          <input type="date" name="targetDate" className="ac-field w-auto text-sm" />
          <button disabled={pending} className="ac-btn px-3 py-2 text-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {pending ? "添加中…" : "添加"}
          </button>
          {state?.error ? (
            <p className="basis-full text-sm text-high">{state.error}</p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
