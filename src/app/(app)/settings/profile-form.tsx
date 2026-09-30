"use client";

import { useActionState } from "react";
import { updateProfileAction, type SettingsFormState } from "./actions";

export function ProfileForm({ initialName }: { initialName: string }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    updateProfileAction,
    null,
  );

  return (
    <form key={initialName} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="settings-name" className="text-sm font-medium text-ink">
          显示名称
        </label>
        <input
          id="settings-name"
          name="name"
          defaultValue={initialName}
          maxLength={50}
          required
          className="ac-field"
          autoComplete="name"
        />
      </div>

      {state && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-sm ${state.status === "error" ? "text-high" : "text-done"}`}
        >
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="ac-btn">
        {pending ? "保存中…" : "保存修改"}
      </button>
    </form>
  );
}
