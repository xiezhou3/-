"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Mail, UserRound } from "lucide-react";
import { registerAction, type FormState } from "./actions";
import { AuthShell } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    registerAction,
    null,
  );

  return (
    <AuthShell
      title="创建账号"
      description="使用校园邮箱注册，加入团队后即可开始协作。"
      footer={
        <p>
          已有账号？
          <Link
            href="/login"
            className="ml-1 font-medium text-primary hover:underline"
          >
            返回登录
          </Link>
        </p>
      }
    >
      <form action={formAction} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-soft">姓名</span>
          <span className="relative block">
            <UserRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              name="name"
              autoComplete="name"
              required
              placeholder="你的姓名"
              className="ac-field h-11 pl-10"
            />
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-soft">邮箱</span>
          <span className="relative block">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@example.com"
              className="ac-field h-11 pl-10"
            />
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-soft">密码</span>
          <span className="relative block">
            <LockKeyhole
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="至少 8 位"
              className="ac-field h-11 pl-10"
            />
          </span>
        </label>
        {state?.error ? (
          <p role="alert" className="rounded-field bg-high-soft px-3 py-2 text-sm text-high">
            {state.error}
          </p>
        ) : null}
        <button disabled={pending} className="ac-btn h-11 w-full">
          {pending ? "注册中…" : "创建账号"}
          {pending ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </form>
    </AuthShell>
  );
}
