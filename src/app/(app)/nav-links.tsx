"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/projects", label: "所有项目" },
  { href: "/teams", label: "我的团队" },
  { href: "/settings", label: "设置" },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const active =
          link.href === "/projects"
            ? pathname.startsWith("/projects")
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-field px-2.5 py-1.5 text-sm transition-colors ${
              active
                ? "bg-primary-soft font-medium text-primary"
                : "text-ink-soft hover:bg-primary-soft hover:text-primary"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
