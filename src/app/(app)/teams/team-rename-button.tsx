"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { renameTeamAction } from "./actions";

export function TeamRenameButton({ teamId, name }: { teamId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
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
    setValue(name);
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await renameTeamAction({ teamId, name: value });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="grid h-7 w-7 place-items-center rounded-field text-ink-faint transition-colors hover:bg-primary-soft hover:text-primary"
        title="修改团队名称"
        aria-label="修改团队名称"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="修改团队名称"
            className="ac-card w-full max-w-sm space-y-3 p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink">修改团队名称</h2>
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
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="ac-field text-sm"
                required
                autoFocus
                aria-label="团队名称"
              />
              {error && <p className="text-sm text-high">{error}</p>}
              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" onClick={() => setOpen(false)} className="ac-btn-ghost">
                  取消
                </button>
                <button type="submit" disabled={pending} className="ac-btn">
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
