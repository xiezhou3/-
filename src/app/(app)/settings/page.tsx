import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/layout/page-header";
import { FeishuCard, TokensCard } from "./feishu-card";
import { ProfileCard } from "./profile-card";

function fmt(d: Date | null): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ feishu?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      feishuName: users.feishuName,
      feishuBoundAt: users.feishuBoundAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  const { feishu } = await searchParams;

  const feishuConfigured = Boolean(
    process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET,
  );

  return (
    <main className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "工作台", href: "/" }, { label: "设置" }]}
        title="设置"
        description="个人信息、通知方式与外部程序的访问凭据。"
        meta={
          row?.createdAt ? (
            <span>注册于 {fmt(row.createdAt)}</span>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard name={row?.name ?? session.user.name ?? ""} email={row?.email ?? ""} />
        <FeishuCard
          boundName={row?.feishuName ?? null}
          boundAtLabel={fmt(row?.feishuBoundAt ?? null)}
          notice={feishu ?? null}
          configured={feishuConfigured}
        />
        <TokensCard />
      </div>
    </main>
  );
}
