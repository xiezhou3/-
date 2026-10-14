"use client";

import { useActionState } from "react";
import { Check, Undo2 } from "lucide-react";
import { reviewTaskAction, type ReviewActionState } from "./actions";

export function ReviewActions({ reviewId }: { reviewId: string }) {
  const [state, formAction, pending] = useActionState<
    ReviewActionState,
    FormData
  >(reviewTaskAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reviewId" value={reviewId} />
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-ink-soft">
          退回说明（仅退回时填写）
        </span>
        <textarea
          name="note"
          rows={3}
          maxLength={500}
          className="ac-field resize-y"
          placeholder="说明需要补充或修改的内容"
          disabled={pending}
        />
      </label>
      {state?.error && <p className="text-sm text-high">{state.error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          name="decision"
          value="reject"
          disabled={pending}
          className="ac-btn-ghost"
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          {pending ? "处理中…" : "退回修改"}
        </button>
        <button
          name="decision"
          value="approve"
          disabled={pending}
          className="ac-btn"
        >
          <Check className="h-4 w-4" aria-hidden />
          {pending ? "处理中…" : "审核通过"}
        </button>
      </div>
    </form>
  );
}
