"use client";

import Link from "next/link";
import { ChevronRight, KeyRound } from "lucide-react";
import { unbindFeishuAction } from "./actions";

type Props = {
  boundName: string | null;
  boundAtLabel: string | null;
  notice: string | null;
  configured: boolean;
};

const NOTICE: Record<string, { text: string; ok: boolean }> = {
  bound: { text: "飞书绑定成功。", ok: true },
  state_error: { text: "绑定校验失败，请重试。", ok: false },
  conflict: { text: "该飞书账号已绑定其他用户。", ok: false },
  error: { text: "绑定失败，请稍后重试。", ok: false },
};

export function FeishuCard({ boundName, boundAtLabel, notice, configured }: Props) {
  const n = notice ? NOTICE[notice] : null;
  return (
    <section className="ac-card space-y-3 p-5">
      <div>
        <h2 className="font-display text-base font-semibold text-ink">飞书通知</h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          绑定飞书后，任务被指派、完成，以及临期/逾期时，你会收到飞书私信提醒。
        </p>
      </div>
      {n && <p className={`text-sm ${n.ok ? "text-done" : "text-high"}`}>{n.text}</p>}
      {boundName ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink">
            已绑定：<span className="font-medium">{boundName}</span>
            {boundAtLabel && <span className="ml-2 text-ink-faint">（{boundAtLabel}）</span>}
          </div>
          <form action={unbindFeishuAction}>
            <button type="submit" className="ac-btn-ghost text-sm">
              解绑
            </button>
          </form>
        </div>
      ) : configured ? (
        // /api/auth/feishu/login 是 Route Handler，OAuth 起点须整页跳转
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href="/api/auth/feishu/login" className="ac-btn inline-block text-sm">
          绑定飞书
        </a>
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed border-line-strong bg-sunken/60 p-3">
          <button
            type="button"
            disabled
            className="ac-btn cursor-not-allowed text-sm opacity-50"
            title="当前部署未配置飞书应用"
          >
            绑定飞书
          </button>
          <p className="text-xs text-ink-faint">
            当前环境未配置飞书应用（需要 `FEISHU_APP_ID` 与 `FEISHU_APP_SECRET`），
            绑定暂不可用；配置后此处会自动启用。
          </p>
        </div>
      )}
    </section>
  );
}

export function TokensCard() {
  return (
    <section className="ac-card p-5">
      <h2 className="font-display text-base font-semibold text-ink">个人访问令牌</h2>
      <p className="mt-0.5 text-sm text-ink-soft">
        供 Claude Code 等外部程序以你的身份写入任务与资源占用。
      </p>
      <Link
        href="/settings/tokens"
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
      >
        <KeyRound className="h-4 w-4 text-ink-faint" aria-hidden />
        管理令牌
        <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
      </Link>
    </section>
  );
}
