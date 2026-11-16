"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createProjectForMeAction } from "./actions";

type TeamOption = { id: string; name: string };

export function NewProjectDialog({
  teams,
  fixedTeamId,
  label = "新建项目",
}: {
  teams: TeamOption[];
  fixedTeamId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState(fixedTeamId ?? teams[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
    setTeamId(fixedTeamId ?? teams[0]?.id ?? "");
    setName("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setError(null);
    setOpen(true);
  }

  function submit() {
    setError(null);
    if (!teamId) {
      setError("请先选择一个团队");
      return;
    }
    startTransition(async () => {
      const result = await createProjectForMeAction({
        teamId,
        name,
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      if (!result || "error" in result) {
        setError(result?.error ?? "创建失败，请重试");
        return;
      }
      setOpen(false);
      router.push(`/projects/${result.projectId}`);
      router.refresh();
    });
  }

  if (teams.length === 0) {
    return (
      <button
        type="button"
        disabled
        className="ac-btn whitespace-nowrap opacity-50"
        title="需要先在团队中成为管理员"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={openDialog} className="ac-btn whitespace-nowrap">
        <Plus className="h-4 w-4" aria-hidden />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="新建项目"
            className="ac-card w-full max-w-lg space-y-3 p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">新建项目</h2>
                <p className="mt-0.5 text-xs text-ink-faint">
                  项目归属某个团队；只有团队管理员可创建。
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
                submit();
              }}
              className="space-y-3"
            >
              {!fixedTeamId && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-ink-soft">所属团队</span>
                  <select
                    value={teamId}
                    onChange={(event) => setTeamId(event.target.value)}
                    className="ac-field text-sm"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block space-y-1">
                <span className="text-xs font-medium text-ink-soft">项目名称</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="ac-field text-sm"
                  placeholder="如：交互设计课程项目"
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
                  placeholder="这个项目要解决什么问题？（可选）"
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

              {error && <p className="text-sm text-high">{error}</p>}

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" onClick={() => setOpen(false)} className="ac-btn-ghost">
                  取消
                </button>
                <button type="submit" disabled={pending} className="ac-btn">
                  {pending ? "创建中…" : "创建项目"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
