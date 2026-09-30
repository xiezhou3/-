import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { countMyPendingInvitations } from "@/lib/invitation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const unreadInvitations = await countMyPendingInvitations(session.user.id);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/85 px-3 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
          <Link href="/projects" className="flex shrink-0 items-center gap-2">
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
      <div className="mx-auto max-w-5xl p-6">{children}</div>
    </div>
  );
}
