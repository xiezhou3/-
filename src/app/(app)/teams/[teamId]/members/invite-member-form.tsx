"use client";

import { useActionState, useEffect, useRef } from "react";
import { UserPlus } from "lucide-react";
import {
  inviteMemberAction,
  type InviteFormState,
} from "./actions";

export function InviteMemberForm({ teamId }: { teamId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<InviteFormState, FormData>(
    inviteMemberAction,
    null,
  );

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <section className="ac-card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="font-medium text-ink">添加成员</h2>
      </div>
      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="teamId" value={teamId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            placeholder="姓名（可选）"
            className="ac-field"
          />
          <input
            name="email"
            type="email"
            placeholder="受邀人邮箱"
            required
            className="ac-field"
          />
        </div>
        {state?.error && <p className="text-sm text-high">{state.error}</p>}
        {state?.success && <p className="text-sm text-done">{state.success}</p>}
        <button disabled={pending} className="ac-btn">
          {pending ? "发送中…" : "发送邀请"}
        </button>
      </form>
    </section>
  );
}
