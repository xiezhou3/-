import { CalendarRange, Flag, Milestone, Package } from "lucide-react";

export type RoadmapItem = {
  id: string;
  title: string;
  kind: "release" | "epic" | "milestone";
  startDate: string;
  endDate: string;
  status: string;
  progress?: number;
};

const DAY = 86_400_000;

export function RoadmapTimeline({
  items,
  projectStart,
  projectEnd,
  today,
}: {
  items: RoadmapItem[];
  projectStart: string | null;
  projectEnd: string | null;
  today: string;
}) {
  const ranges = [
    projectStart,
    projectEnd,
    today,
    ...items.flatMap((item) => [item.startDate, item.endDate]),
  ].filter((value): value is string => Boolean(value));
  const min = ranges.sort()[0] ?? today;
  const max = ranges.at(-1) ?? today;
  const rangeStart = addDays(parseDay(min), -7);
  const rangeEnd = addDays(parseDay(max), 7);
  const totalDays = Math.max(
    1,
    Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY),
  );
  const ticks = Array.from({ length: 6 }, (_, index) =>
    addDays(rangeStart, Math.round((totalDays * index) / 5)),
  );

  return (
    <section className="ac-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
            项目路线图
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            按 Release 日期与 Epic 起止日期生成，只读视图。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-ink-faint">
          <Legend className="bg-accent" label="Release" />
          <Legend className="bg-primary" label="Epic" />
          <Legend className="bg-medium" label="里程碑" />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <CalendarRange className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
          <p className="mt-2 text-sm text-ink-faint">
            给 Release、Epic 或里程碑设置日期后，路线图会显示在这里。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px] px-4 py-4">
            <div className="grid grid-cols-[12rem_minmax(0,1fr)] gap-3">
              <div />
              <div className="relative h-7 border-b border-line">
                {ticks.map((tick, index) => (
                  <span
                    key={tick.toISOString()}
                    className="absolute top-0 -translate-x-1/2 text-[10px] text-ink-faint"
                    style={{ left: `${(index / 5) * 100}%` }}
                  >
                    {formatTick(tick)}
                  </span>
                ))}
                <span
                  className="absolute bottom-0 top-0 border-l border-dashed border-accent"
                  style={{ left: `${position(today, rangeStart, totalDays)}%` }}
                  title="今天"
                />
              </div>
            </div>

            <div className="mt-2 space-y-2">
              {items.map((item) => {
                const left = position(item.startDate, rangeStart, totalDays);
                const end = position(item.endDate, rangeStart, totalDays);
                const width = Math.max(1.7, end - left);
                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="grid grid-cols-[12rem_minmax(0,1fr)] items-center gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ItemIcon kind={item.kind} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">
                          {item.title}
                        </p>
                        <p className="truncate text-[10px] text-ink-faint">
                          {item.startDate === item.endDate
                            ? item.startDate
                            : `${item.startDate} → ${item.endDate}`}
                        </p>
                      </div>
                    </div>
                    <div className="relative h-8 rounded-field bg-sunken/70">
                      <div
                        className={`absolute top-1.5 h-5 overflow-hidden rounded-[5px] ${barTone(item)}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${item.title} · ${item.status}`}
                      >
                        {typeof item.progress === "number" && (
                          <span
                            className="absolute inset-y-0 left-0 bg-white/25"
                            style={{ width: `${Math.min(100, item.progress)}%` }}
                          />
                        )}
                        <span className="relative z-10 block truncate px-1.5 text-[10px] font-medium leading-5 text-white">
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ItemIcon({ kind }: { kind: RoadmapItem["kind"] }) {
  const Icon =
    kind === "release" ? Package : kind === "epic" ? Flag : Milestone;
  return (
    <Icon
      className={`h-3.5 w-3.5 shrink-0 ${
        kind === "release"
          ? "text-accent"
          : kind === "epic"
            ? "text-primary"
            : "text-medium"
      }`}
      aria-hidden
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-4 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function barTone(item: RoadmapItem) {
  if (item.kind === "release") {
    return item.status === "已发布"
      ? "bg-done"
      : item.status === "已取消"
        ? "bg-low"
        : "bg-accent";
  }
  return item.kind === "epic" ? "bg-primary" : "bg-medium";
}

function parseDay(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

function position(value: string, start: Date, totalDays: number) {
  const diff = Math.round((parseDay(value).getTime() - start.getTime()) / DAY);
  return Math.min(100, Math.max(0, (diff / totalDays) * 100));
}

function formatTick(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
