import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Mail, Search } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { countMyPendingInvitations } from "@/lib/invitation";
import { countPendingTaskReviewsForAdmin } from "@/lib/task-review";
import { countUnreadNotifications } from "@/lib/notification";

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

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/85 px-3 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
          <Link href="/workbench" className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-md bg-primary font-display text-sm font-bold text-white shadow-sm"
            >
              A
            </span>
            <span className="hidden font-display text-lg font-semibold text-ink sm:inline">
              AgileCampus
            </span>
          </Link>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <Link
              href="/workbench"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-field px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              工作台
            </Link>
            <Link
              href="/projects"
              className="shrink-0 rounded-field px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
            >
              所有项目
            </Link>
            <Link
              href="/teams"
              className="shrink-0 rounded-field px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
            >
              我的团队
            </Link>
            <Link
              href="/settings"
              className="shrink-0 rounded-field px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
            >
              设置
            </Link>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <form action="/search" className="hidden md:block">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <input
                name="q"
                className="ac-field w-44 py-1.5 pl-8 text-xs lg:w-56"
                placeholder="搜索任务、项目、任务编号"
                aria-label="全局搜索"
              />
            </label>
          </form>
          <Link
            href="/search"
            aria-label="全局搜索"
            className="grid h-9 w-9 place-items-center rounded-field text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary md:hidden"
          >
            <Search className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href="/invitations"
            aria-label={`消息${unreadMessages > 0 ? `，${unreadMessages} 条未处理` : ""}`}
            className="relative grid h-9 w-9 place-items-center rounded-field text-ink-soft transition-colors hover:bg-primary-soft hover:text-primary"
          >
            <Mail className="h-5 w-5" aria-hidden />
            {unreadMessages > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-high px-1 text-[10px] font-semibold leading-4 text-white">
                {unreadMessages > 99 ? "99+" : unreadMessages}
              </span>
            )}
          </Link>
          <div className="hidden text-right leading-tight sm:block">
            <span className="block text-sm text-ink">{session.user.name}</span>
            {session.user.email && (
              <span className="block text-xs text-ink-soft">{session.user.email}</span>
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
      </header>
      <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
    </div>
  );
}
