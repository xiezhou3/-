"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe2, KeyRound, ShieldCheck, UserRound } from "lucide-react";

const items = [
  {
    href: "/settings",
    label: "个人资料",
    description: "姓名与账号信息",
    icon: UserRound,
  },
  {
    href: "/settings/security",
    label: "账号安全",
    description: "密码与飞书绑定",
    icon: ShieldCheck,
  },
  {
    href: "/settings/language",
    label: "语言",
    description: "界面显示语言",
    icon: Globe2,
  },
  {
    href: "/settings/tokens",
    label: "个人访问令牌",
    description: "外部程序访问权限",
    icon: KeyRound,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:sticky lg:top-20 lg:flex-col lg:self-start lg:overflow-visible lg:pb-0">
      {items.map((item) => {
        const active =
          item.href === "/settings"
            ? pathname === "/settings"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-field px-3 py-2.5 text-sm transition-colors lg:items-start ${
              active
                ? "bg-primary-soft text-primary"
                : "text-ink-soft hover:bg-sunken hover:text-ink"
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <span className="block font-medium">{item.label}</span>
              <span
                className={`mt-0.5 hidden text-xs font-normal lg:block ${
                  active ? "text-primary/75" : "text-ink-faint"
                }`}
              >
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
