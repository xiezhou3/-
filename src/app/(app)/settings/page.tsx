import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ProfileForm } from "./profile-form";

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!row) redirect("/login");

  const initial = Array.from(row.name.trim())[0]?.toUpperCase() ?? "用";

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-xl font-semibold text-ink">个人资料</h1>
        <p className="text-sm text-ink-soft">这些信息会显示在团队成员和任务负责人列表中。</p>
      </header>

      <section className="ac-card p-5">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-2xl font-semibold text-primary"
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold text-ink">{row.name}</p>
            <p className="truncate text-sm text-ink-soft">{row.email}</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">登录邮箱</dt>
            <dd className="mt-1 break-all text-ink">{row.email}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">注册时间</dt>
            <dd className="mt-1 text-ink">{fmt(row.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="ac-card space-y-4 p-5">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">基本资料</h2>
          <p className="mt-1 text-sm text-ink-soft">登录邮箱不可修改。</p>
        </div>
        <ProfileForm initialName={row.name} />
      </section>
    </div>
  );
}
