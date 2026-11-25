"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { disbandTeamAction, type FormState } from "./actions";

export function TeamDisbandButton({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    disbandTeamAction,
    null,
  );

  return (
    <div className="shrink-0 text-right">
      <form
        action={formAction}
        onSubmit={(event) => {
          const confirmed = window.confirm(
            `解散“${teamName}”后将永久删除团队成员、项目、任务、资源和标签数据，且无法恢复。确认继续吗？`,
          );
          if (!confirmed) event.preventDefault();
        }}
      >
        <input type="hidden" name="teamId" value={teamId} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-field border border-high/20 bg-high-soft px-2.5 text-xs font-medium text-high transition-colors hover:border-high/35 hover:bg-high/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {pending ? "正在解散..." : "解散团队"}
        </button>
      </form>
      {state?.error ? (
        <p role="alert" className="mt-1 max-w-48 text-xs text-high">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
