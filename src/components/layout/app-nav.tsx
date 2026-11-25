"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  LayoutDashboard,
  Mail,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

export function AppNav({
  variant,
  unreadMessages,
}: {
  variant: "desktop" | "mobile";
  unreadMessages: number;
}) {
  const pathname = usePathname();
  const groups: NavGroup[] = [
    {
      title: "工作区",
      items: [
        {
          href: "/workbench",
          label: "工作台",
          icon: LayoutDashboard,
          exact: true,
        },
        {
          href: "/projects",
          label: "项目",
          icon: FolderKanban,
        },
        {
          href: "/teams",
          label: "团队",
          icon: Users,
        },
      ],
    },
    {
      title: "管理",
      items: [
        {
          href: "/search",
          label: "全局搜索",
          icon: Search,
          exact: true,
        },
        {
          href: "/invitations",
          label: "消息中心",
          icon: Mail,
          exact: true,
          badge: unreadMessages,
        },
        {
          href: "/settings",
          label: "设置",
          icon: Settings,
        },
      ],
    },
  ];

  function active(item: NavItem) {
    if (item.href === "/workbench") {
      return pathname === "/workbench" || pathname === "/";
    }
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  if (variant === "mobile") {
    const mobileItems = groups
      .flatMap((group) => group.items)
      .filter(
        (item) =>
          item.href !== "/search" && item.href !== "/invitations",
      );

    return (
      <nav aria-label="主导航" className="ac-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const selected = active(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-field border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary text-white shadow-sm"
                  : "border-line bg-surface text-ink-soft hover:border-primary-ring hover:bg-primary-soft hover:text-primary"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {item.label}
              {item.badge ? (
                <span
                  className={`min-w-4 rounded-full px-1 text-center text-[10px] tabular-nums ${
                    selected ? "bg-white/20 text-white" : "bg-high text-white"
                  }`}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="主导航" className="space-y-5">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const selected = active(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={selected ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-field px-3 py-2.5 text-sm transition-colors ${
                    selected
                      ? "bg-primary text-white shadow-sm"
                      : "text-ink-soft hover:bg-primary-soft hover:text-primary"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition-opacity ${
                      selected ? "bg-accent opacity-100" : "opacity-0"
                    }`}
                  />
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      selected
                        ? "text-white"
                        : "text-ink-faint group-hover:text-primary"
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span
                      className={`grid min-h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                        selected
                          ? "bg-white/20 text-white"
                          : "bg-high text-white"
                      }`}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
