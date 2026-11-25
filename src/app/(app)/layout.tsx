import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Mail, Search } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { countMyPendingInvitations } from "@/lib/invitation";
import { countPendingTaskReviewsForAdmin } from "@/lib/task-review";
import { countUnreadNotifications } from "@/lib/notification";
import { AppNav } from "@/components/layout/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [unreadInvitations, pendingReviews, unreadNotifications] = await Promise.all([
    countMyPendingInvitations(session.user.id),
    countPendingTaskReviewsForAdmin(session.user.id),
    countUnreadNotifications(session.user.id),
  ]);
  const unreadMessages =
    unreadInvitations + pendingReviews + unreadNotifications;
  const initial = Array.from(session.user.name?.trim() || "用")[0]?.toUpperCase() ?? "用";

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-field bg-primary px-3 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        跳到主要内容
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-20 items-center border-b border-line px-5">
          <Link href="/workbench" className="group flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-[10px] bg-primary font-display text-lg font-bold text-white shadow-sm transition-transform group-hover:-rotate-3"
            >
              A
            </span>
            <span>
              <span className="block font-display text-lg font-semibold leading-tight text-ink">
                AgileCampus
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                Team workspace
              </span>
            </span>
          </Link>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          <AppNav variant="desktop" unreadMessages={unreadMessages} />
        </div>

        <div className="border-t border-line p-3">
          <div className="rounded-card border border-line bg-sunken/65 p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-white">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {session.user.name}
                </p>
                {session.user.email ? (
                  <p className="truncate text-[11px] text-ink-faint">
                    {session.user.email}
                  </p>
                ) : null}
              </div>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="mt-3"
            >
              <button className="inline-flex w-full items-center justify-center gap-1.5 rounded-field border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-high/30 hover:bg-high-soft hover:text-high">
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                退出登录
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/92 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-3 sm:px-5 lg:px-8">
            <Link href="/workbench" className="flex shrink-0 items-center gap-2 lg:hidden">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary font-display text-base font-bold text-white"
              >
                A
              </span>
              <span className="hidden font-display text-base font-semibold text-ink sm:inline">
                AgileCampus
              </span>
            </Link>

            <div className="hidden min-w-0 flex-1 lg:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                校园协作工作区
              </p>
              <p className="truncate text-sm font-medium text-ink">
                把计划、交付和讨论放在同一个节奏里
              </p>
            </div>

            <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none">
              <form action="/search" className="hidden min-w-0 flex-1 md:block lg:w-64 lg:flex-none xl:w-80">
                <label className="relative block">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                    aria-hidden
                  />
                  <input
                    name="q"
                    className="ac-field h-9 py-1.5 pl-9 pr-3 text-xs"
                    placeholder="搜索任务、项目或编号"
                    aria-label="全局搜索"
                  />
                </label>
              </form>
              <Link
                href="/search"
                aria-label="全局搜索"
                className="grid h-9 w-9 place-items-center rounded-field border border-transparent text-ink-soft transition-colors hover:border-line hover:bg-primary-soft hover:text-primary md:hidden"
              >
                <Search className="h-4.5 w-4.5" aria-hidden />
              </Link>
              <Link
                href="/invitations"
                aria-label={`消息${unreadMessages > 0 ? `，${unreadMessages} 条未处理` : ""}`}
                className="relative grid h-9 w-9 place-items-center rounded-field border border-transparent text-ink-soft transition-colors hover:border-line hover:bg-primary-soft hover:text-primary"
              >
                <Mail className="h-4.5 w-4.5" aria-hidden />
                {unreadMessages > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-high px-1 text-[10px] font-semibold leading-4 text-white">
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/settings"
                className="hidden items-center gap-2 rounded-field border border-line bg-surface py-1 pl-1 pr-2.5 transition-colors hover:border-primary-ring hover:bg-primary-soft sm:flex"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white">
                  {initial}
                </span>
                <span className="max-w-28 truncate text-xs font-medium text-ink">
                  {session.user.name}
                </span>
              </Link>
            </div>
          </div>
          <div className="border-t border-line/80 px-3 py-2 lg:hidden">
            <AppNav variant="mobile" unreadMessages={unreadMessages} />
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[112rem] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
