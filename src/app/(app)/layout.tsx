import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { countMyPendingInvitations } from "@/lib/invitation";
import { SideNav } from "@/components/layout/side-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const unreadInvitations = await countMyPendingInvitations(session.user.id);
  const initial = session.user.name?.trim().slice(0, 1).toUpperCase() || "A";

  return (
    <div className="min-h-screen">
      {/* 桌面端常驻侧栏：导航始终可见，任意页面都能横向切换 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <Link href="/" className="flex items-center gap-2.5 border-b border-line px-4 py-4">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-white shadow-sm"
          >
            A
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-semibold leading-tight text-ink">
              AgileCampus
            </span>
            <span className="block text-[11px] leading-tight text-ink-faint">敏捷校园</span>
          </span>
        </Link>

        <div className="flex-1 overflow-y-auto py-3">
          <SideNav variant="sidebar" />
        </div>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-field px-1 py-1">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
              {initial}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{session.user.name}</span>
              {session.user.email && (
                <span className="block truncate text-[11px] text-ink-faint">
                  {session.user.email}
                </span>
              )}
            </span>
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-2 lg:hidden">
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary font-display text-sm font-bold text-white"
              >
                A
              </span>
              <span className="truncate font-display text-base font-semibold text-ink">
                AgileCampus
              </span>
            </Link>
            <span className="hidden text-xs text-ink-faint lg:block">
              高校团队的敏捷项目工作台
            </span>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                href="/invitations"
                aria-label={`邀请消息${unreadInvitations > 0 ? `，${unreadInvitations} 条未处理` : ""}`}
                className="relative grid h-9 w-9 place-items-center rounded-field text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
              >
                <Mail className="h-5 w-5" aria-hidden />
                {unreadInvitations > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-high px-1 text-[10px] font-semibold leading-4 text-white">
                    {unreadInvitations > 99 ? "99+" : unreadInvitations}
                  </span>
                )}
              </Link>
              <div className="hidden text-right leading-tight sm:block">
                <span className="block text-sm text-ink">{session.user.name}</span>
                {session.user.email && (
                  <span className="block text-xs text-ink-faint">{session.user.email}</span>
                )}
              </div>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button className="ac-btn-ghost">退出</button>
              </form>
            </div>
          </div>

          <div className="border-t border-line px-3 py-2 lg:hidden">
            <SideNav variant="top" />
          </div>
        </header>

        <div className="ac-page p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
