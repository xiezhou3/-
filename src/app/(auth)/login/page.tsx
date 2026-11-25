"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail } from "lucide-react";
import { loginAction, type FormState } from "./actions";
import { FeishuLogin } from "./feishu-login";
import { AuthShell } from "@/components/auth/auth-shell";

function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    loginAction,
    null,
  );
  const registered = useSearchParams().get("registered");

  return (
    <AuthShell
      title="欢迎回来"
      description="登录后继续查看项目进度与今日任务。"
      footer={
        <p>
          没有账号？
          <Link
            href="/register"
            className="ml-1 font-medium text-primary hover:underline"
          >
            创建账号
          </Link>
        </p>
      }
    >
      {registered ? (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-field border border-done/20 bg-done/8 px-3 py-2 text-sm text-done"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          注册成功，请使用新账号登录。
        </p>
      ) : null}
      <form action={formAction} className="space-y-4">
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
              autoComplete="current-password"
              required
              placeholder="输入登录密码"
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
          {pending ? "登录中…" : "进入工作区"}
          {pending ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-[11px] text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        其他登录方式
        <span className="h-px flex-1 bg-line" />
      </div>
      <FeishuLogin />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
