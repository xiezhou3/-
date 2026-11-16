import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1 text-xs text-ink-faint">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
            {item.href && !last ? (
              <Link href={item.href} className="transition-colors hover:text-primary">
                {item.label}
              </Link>
            ) : (
              <span className={last ? "text-ink-soft" : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function PageHeader({
  breadcrumbs,
  icon,
  title,
  description,
  meta,
  actions,
}: {
  breadcrumbs?: Crumb[];
  icon?: ReactNode;
  title: string;
  description?: string | null;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-2 border-b border-line pb-5">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
            {description && (
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>
        )}
      </div>
      {meta && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
          {meta}
        </div>
      )}
    </header>
  );
}
