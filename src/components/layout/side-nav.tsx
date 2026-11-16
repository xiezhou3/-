"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, Settings, Users } from "lucide-react";

const ITEMS = [
  { href: "/", label: "工作台", icon: LayoutDashboard, exact: true },
  { href: "/projects", label: "项目", icon: FolderKanban, exact: false },
  { href: "/teams", label: "团队", icon: Users, exact: false },
  { href: "/settings", label: "设置", icon: Settings, exact: false },
] as const;

export function SideNav({ variant = "sidebar" }: { variant?: "sidebar" | "top" }) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  if (variant === "top") {
    return (
      <nav aria-label="主导航" className="flex items-center gap-1 overflow-x-auto">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-field px-2.5 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-primary-soft font-medium text-primary"
                  : "text-ink-soft hover:bg-primary-soft hover:text-primary"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="主导航" className="flex flex-col gap-0.5 px-2">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-2.5 rounded-field px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-primary-soft font-medium text-primary"
                : "text-ink-soft hover:bg-sunken hover:text-ink"
            }`}
          >
            <span
              aria-hidden
              className={`absolute left-0 h-4 w-0.5 rounded-full bg-primary transition-opacity ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
            <Icon
              className={`h-4 w-4 ${active ? "text-primary" : "text-ink-faint group-hover:text-ink-soft"}`}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
