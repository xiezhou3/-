import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type Crumb = {
  label: string;
  href?: string;
};

export function PageHeader({
  eyebrow,
  breadcrumbs,
  icon,
  title,
  description,
  meta,
  actions,
}: {
  eyebrow?: string;
  breadcrumbs?: Crumb[];
  icon?: ReactNode;
  title: string;
  description?: string | null;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      {breadcrumbs?.length ? (
        <nav
          aria-label="面包屑"
          className="flex flex-wrap items-center gap-1 text-[11px] text-ink-faint"
        >
          {breadcrumbs.map((item, index) => {
            const last = index === breadcrumbs.length - 1;
            return (
              <span
                key={`${item.label}-${index}`}
                className="inline-flex items-center gap-1"
              >
                {index > 0 ? (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                ) : null}
                {item.href && !last ? (
                  <Link
                    href={item.href}
                    className="transition-colors hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className={last ? "text-ink-soft" : undefined}>
                    {item.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-display text-2xl font-semibold leading-tight text-ink sm:text-[1.75rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>

      {meta ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
          {meta}
        </div>
      ) : null}
    </header>
  );
}
