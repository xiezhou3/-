"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";
import {
  respondInvitationAction,
  type InvitationResponseState,
} from "./actions";

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const [state, formAction, pending] = useActionState<
    InvitationResponseState,
    FormData
  >(respondInvitationAction, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="invitationId" value={invitationId} />
      <div className="flex flex-wrap gap-2">
        <button
          name="response"
          value="accept"
          disabled={pending}
          className="ac-btn"
        >
          <Check className="h-4 w-4" aria-hidden />
          {pending ? "处理中…" : "接受"}
        </button>
        <button
          name="response"
          value="reject"
          disabled={pending}
          className="ac-btn-ghost"
        >
          <X className="h-4 w-4" aria-hidden />
          拒绝
        </button>
      </div>
      {state?.error && <p className="text-sm text-high">{state.error}</p>}
    </form>
  );
}
