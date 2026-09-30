"use client";

import { useActionState } from "react";
import { changePasswordAction, type SettingsFormState } from "../actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="current-password" className="text-sm font-medium text-ink">
          当前密码
        </label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          required
          className="ac-field"
          autoComplete="current-password"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="new-password" className="text-sm font-medium text-ink">
            新密码
          </label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            required
            minLength={8}
            maxLength={64}
            className="ac-field"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-medium text-ink">
            确认新密码
          </label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={64}
            className="ac-field"
            autoComplete="new-password"
          />
        </div>
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
        {pending ? "更新中…" : "更新密码"}
      </button>
    </form>
  );
}
