"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, X } from "lucide-react";
import { updateProjectAction } from "./actions";

type EditableProject = {
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
};

export function ProjectEditDialog({
  projectId,
  project,
  canEdit,
}: {
  projectId: string;
  project: EditableProject;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [endDate, setEndDate] = useState(project.endDate ?? "");
  const [status, setStatus] = useState(project.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openDialog() {
    setName(project.name);
    setDescription(project.description ?? "");
    setStartDate(project.startDate ?? "");
    setEndDate(project.endDate ?? "");
    setStatus(project.status);
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateProjectAction({
        projectId,
        name,
        description: description.trim() ? description.trim() : null,
        startDate: startDate || null,
        endDate: endDate || null,
        status: status === "archived" ? "archived" : "active",
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!canEdit) return null;

  return (
    <>
      <button type="button" onClick={openDialog} className="ac-btn-ghost whitespace-nowrap">
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        编辑
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="编辑项目"
            className="ac-card w-full max-w-lg space-y-3 p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">编辑项目</h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  名称、描述与排期对全体成员可见，仅团队管理员可改。
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

            <form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
              className="space-y-3"
            >
              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-soft">项目名称</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="ac-field text-sm"
                  required
                  autoFocus
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-soft">项目描述</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="ac-field min-h-20 resize-y text-sm"
                  placeholder="这个项目要解决什么问题？"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-soft">开始日期</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="ac-field text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-soft">结束日期</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="ac-field text-sm"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-soft">项目状态</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="ac-field text-sm"
                >
                  <option value="active">进行中</option>
                  <option value="archived">已归档</option>
                </select>
                <span className="block text-xs text-ink-faint">
                  归档不会删除任务，只在总览里标记为已归档。
                </span>
              </label>

              {error && <p className="text-sm text-high">{error}</p>}

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ac-btn-ghost"
                >
                  取消
                </button>
                <button type="submit" disabled={pending} className="ac-btn">
                  {status === "archived" ? (
                    <Archive className="h-3.5 w-3.5" aria-hidden />
                  ) : null}
                  {pending ? "保存中…" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
