import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { FeishuCard } from "../feishu-card";
import { PasswordForm } from "./password-form";

function fmt(d: Date | null): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ feishu?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [row] = await db
    .select({
      email: users.email,
      createdAt: users.createdAt,
      feishuName: users.feishuName,
      feishuBoundAt: users.feishuBoundAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!row) redirect("/login");

  const { feishu } = await searchParams;
  const feishuManaged = row.email.endsWith("@feishu.local");

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-xl font-semibold text-ink">账号安全</h1>
        <p className="text-sm text-ink-soft">管理密码和飞书登录绑定。</p>
      </header>

      <section className="ac-card p-5">
        <h2 className="font-display text-base font-semibold text-ink">账号信息</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">登录邮箱</dt>
            <dd className="mt-1 break-all text-ink">{row.email}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">账号类型</dt>
            <dd className="mt-1 text-ink">{feishuManaged ? "飞书账号" : "邮箱账号"}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">创建时间</dt>
            <dd className="mt-1 text-ink">{fmt(row.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="ac-card space-y-4 p-5">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">修改密码</h2>
          <p className="mt-1 text-sm text-ink-soft">修改后，当前会话和其他已登录设备不会被强制退出。</p>
        </div>
        {feishuManaged ? (
          <p className="rounded-field bg-primary-soft px-3 py-2 text-sm text-primary">
            该账号通过飞书创建，请继续使用飞书登录。
          </p>
        ) : (
          <PasswordForm />
        )}
      </section>

      <FeishuCard
        boundName={row.feishuName}
        boundAtLabel={fmt(row.feishuBoundAt)}
        notice={feishu ?? null}
      />
    </div>
  );
}
