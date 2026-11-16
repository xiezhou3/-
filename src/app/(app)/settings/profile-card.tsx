"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "./actions";

export function ProfileCard({ name, email }: { name: string; email: string }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    null,
  );
  const error = state && "error" in state ? state.error : null;
  const saved = state && "ok" in state;

  return (
    <section className="ac-card space-y-3 p-5">
      <div>
        <h2 className="font-display text-base font-semibold text-ink">个人信息</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          昵称会显示在任务负责人、评论和团队列表里。
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-soft">昵称</span>
          <input
            name="name"
            defaultValue={name}
            className="ac-field text-sm"
            maxLength={40}
            required
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-soft">邮箱</span>
          <input
            value={email}
            readOnly
            disabled
            className="ac-field text-sm disabled:bg-sunken disabled:text-ink-faint"
          />
          <span className="block text-xs text-ink-faint">
            邮箱用于登录，当前不支持自助修改。
          </span>
        </label>

        {error && <p className="text-sm text-high">{error}</p>}
        {saved && !error && <p className="text-sm text-done">已保存。</p>}

        <div className="flex justify-end">
          <button disabled={pending} className="ac-btn">
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </section>
  );
}
