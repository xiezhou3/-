import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto max-w-5xl py-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-ink">设置</h1>
        <p className="text-sm text-ink-soft">管理个人资料、账号安全和开发者访问。</p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <SettingsNav />
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
