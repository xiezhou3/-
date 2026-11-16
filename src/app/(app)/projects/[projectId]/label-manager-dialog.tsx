"use client";

import { useActionState, useEffect, useState } from "react";
import { Tag, Trash2, X } from "lucide-react";
import { LABEL_COLORS, LABEL_COLOR_CLASS } from "@/lib/board-columns";
import {
  createLabelForProjectAction,
  deleteLabelForProjectAction,
  type LabelFormState,
} from "./label-actions";

type Label = { id: string; name: string; color: string };

const COLOR_LABEL: Record<string, string> = {
  slate: "灰",
  red: "红",
  amber: "琥珀",
  green: "绿",
  blue: "蓝",
  violet: "紫",
  pink: "粉",
};

export function LabelManagerDialog({
  projectId,
  teamId,
  labels,
  isAdmin,
}: {
  projectId: string;
  teamId: string;
  labels: Label[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<LabelFormState, FormData>(
    createLabelForProjectAction,
    null,
  );

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ac-btn-ghost whitespace-nowrap"
      >
        <Tag className="h-3.5 w-3.5" aria-hidden />
        标签 {labels.length}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="管理标签"
            className="ac-card w-full max-w-lg space-y-3 p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">标签</h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  标签属于团队，团队内所有项目共用；在这里贴到任务上。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-field text-ink-faint hover:bg-sunken hover:text-ink"
                aria-label="关闭"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {isAdmin && (
              <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-sunken/70 p-3">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="teamId" value={teamId} />
                <label className="min-w-0 flex-1 space-y-1">
                  <span className="text-xs font-medium text-ink-soft">标签名</span>
                  <input
                    name="name"
                    maxLength={20}
                    className="ac-field text-sm"
                    placeholder="如：论文、答辩、实验"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-ink-soft">颜色</span>
                  <select name="color" defaultValue="slate" className="ac-field w-auto text-sm">
                    {LABEL_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {COLOR_LABEL[color] ?? color}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={pending} className="ac-btn px-3 py-2 text-sm">
                  {pending ? "添加中…" : "添加"}
                </button>
                {state?.error && <p className="w-full text-xs text-high">{state.error}</p>}
              </form>
            )}

            {labels.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft">
                还没有标签。{isAdmin ? "在上方添加第一个，比如按阶段或类型分类。" : ""}
              </p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto ac-scrollbar">
                {labels.map((label) => (
                  <li
                    key={label.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                  >
                    <span
                      className={`ac-badge ${LABEL_COLOR_CLASS[label.color] ?? LABEL_COLOR_CLASS.slate}`}
                    >
                      {label.name}
                    </span>
                    {isAdmin && (
                      <form
                        action={deleteLabelForProjectAction}
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              `删除标签「${label.name}」？所有任务上的这个标签会一并移除。`,
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="teamId" value={teamId} />
                        <input type="hidden" name="labelId" value={label.id} />
                        <button
                          type="submit"
                          className="grid h-7 w-7 place-items-center rounded-field text-ink-faint transition-colors hover:bg-high-soft hover:text-high"
                          aria-label={`删除标签 ${label.name}`}
                          title="删除标签"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
