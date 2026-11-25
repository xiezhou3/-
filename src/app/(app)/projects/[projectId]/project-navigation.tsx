"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  Clock3,
  FolderOpen,
  GitBranch,
  KanbanSquare,
  ListTree,
  Map,
  PlugZap,
  Repeat2,
  Settings2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { TeamRole } from "@/db/schema";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  exact?: boolean;
};

const ROLE_LABEL: Record<TeamRole, string> = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
};

export function ProjectNavigation({
  projectId,
  projectName,
  teamName,
  role,
  status,
  startDate,
  endDate,
  integrationCount,
  automationCount,
}: {
  projectId: string;
  projectName: string;
  teamName: string;
  role: TeamRole;
  status: "active" | "archived";
  startDate: string | null;
  endDate: string | null;
  integrationCount: number;
  automationCount: number;
}) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: "工作",
      items: [
        {
          href: base,
          label: "项目看板",
          icon: KanbanSquare,
          exact: true,
        },
        { href: `${base}/backlog`, label: "Backlog", icon: ListTree },
        { href: `${base}/sprints`, label: "迭代", icon: Repeat2 },
      ],
    },
    {
      title: "交付",
      items: [
        { href: `${base}/planning`, label: "项目规划", icon: Map },
        { href: `${base}/timeline`, label: "时间线", icon: CalendarRange },
        { href: `${base}/reports`, label: "报表分析", icon: BarChart3 },
      ],
    },
    {
      title: "配置",
      items: [
        { href: `${base}/files`, label: "项目文件", icon: FolderOpen },
        { href: `${base}/repository`, label: "代码仓库", icon: GitBranch },
        {
          href: `${base}/integrations`,
          label: "集成中心",
          icon: PlugZap,
          badge: integrationCount || undefined,
        },
        {
          href: `${base}/automations`,
          label: "自动化",
          icon: Workflow,
          badge: automationCount || undefined,
        },
        { href: `${base}/workflow`, label: "工作流", icon: Settings2 },
      ],
    },
  ];

  function active(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <>
      <div className="min-w-0 lg:hidden">
        <div className="sticky top-[6.8rem] z-10 -mx-4 min-w-0 overflow-hidden border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={base}
              className="flex min-w-0 shrink-0 items-center gap-2"
            >
              <span className="grid h-7 w-7 place-items-center rounded-field bg-primary text-xs font-bold text-white">
                P
              </span>
              <span className="max-w-32 truncate text-sm font-medium text-ink">
                {projectName}
              </span>
            </Link>
            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
              {groups.flatMap((group) => group.items).map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active(item) ? "page" : undefined}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-field px-2.5 py-1.5 text-xs transition-colors ${
                      active(item)
                        ? "bg-primary text-white"
                        : "border border-line bg-surface text-ink-soft hover:border-primary-ring hover:bg-primary-soft hover:text-primary"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {item.label}
                    {item.badge !== undefined && (
                      <span className="rounded-full bg-white/20 px-1 text-[10px] tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="border-b border-line bg-sunken/35 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                {teamName}
              </span>
              <span
                className={`ac-badge ${
                  status === "active"
                    ? "bg-done/12 text-done"
                    : "bg-sunken text-ink-soft"
                }`}
              >
                {status === "active" ? "进行中" : "已归档"}
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-field bg-primary text-[11px] font-bold text-white">
                {Array.from(projectName.trim())[0] ?? "P"}
              </span>
              <Link
                href={base}
                className="block min-w-0 font-display text-base font-semibold leading-snug text-ink hover:text-primary"
              >
                {projectName}
              </Link>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
              <Clock3 className="h-3 w-3" aria-hidden />
              {startDate ?? "未设"} → {endDate ?? "未设"}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint">
              <span>{ROLE_LABEL[role]}</span>
              <span className="h-1 w-1 rounded-full bg-line-strong" />
              <span>项目 #{projectId.slice(0, 6)}</span>
            </div>
          </div>

          <nav className="space-y-4 px-2.5 py-3" aria-label="项目导航">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
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
                        className={`group flex items-center gap-2.5 rounded-field px-2.5 py-2 text-sm transition-colors ${
                          selected
                            ? "bg-primary text-white shadow-sm"
                            : "text-ink-soft hover:bg-primary-soft hover:text-primary"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            selected ? "text-white" : "text-ink-faint group-hover:text-primary"
                          }`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span
                            className={`min-w-4 rounded-full px-1 text-center text-[10px] tabular-nums ${
                              selected
                                ? "bg-white/20 text-white"
                                : "bg-sunken text-ink-faint"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-line px-4 py-3">
            <Link
              href="/projects"
              className="text-xs text-ink-faint transition-colors hover:text-primary"
            >
              ← 返回所有项目
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
