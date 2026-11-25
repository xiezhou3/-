"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Gauge, Save, UsersRound } from "lucide-react";
import type { SprintCapacitySummary } from "@/lib/planning";
import {
  saveSprintCapacityAction,
  type PlanningActionState,
} from "./actions";

const ROLE_LABEL = {
  admin: "管理员",
  teacher: "教师",
  student: "学生",
} as const;

function errorOf(state: PlanningActionState) {
  return state && !state.ok ? state.error : "";
}

export function CapacityManager({
  projectId,
  capacity,
  canWrite,
}: {
  projectId: string;
  capacity: SprintCapacitySummary;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    PlanningActionState,
    FormData
  >(saveSprintCapacityAction, null);
  const editable = canWrite && capacity.status !== "closed";

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-5">
      <section className="ac-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-ink">
                {capacity.sprintName}
              </h2>
              <span
                className={`ac-badge ${
                  capacity.status === "active"
                    ? "bg-primary-soft text-primary"
                    : capacity.status === "planned"
                      ? "bg-medium-soft text-medium"
                      : "bg-sunken text-ink-soft"
                }`}
              >
                {capacity.status === "active"
                  ? "进行中"
                  : capacity.status === "planned"
                    ? "计划中"
                    : "已关闭"}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {capacity.startDate} → {capacity.endDate}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-3">
            <Metric label="故事点" value={`${capacity.estimateTotal}/${capacity.storyPointCapacity}`} />
            <Metric label="可用工时" value={`${formatHours(capacity.availableHours)}h`} />
            <Metric label="实际工时" value={`${formatHours(capacity.actualHours)}h`} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CapacityBar
            label="计划负载"
            value={capacity.estimatedHours}
            total={capacity.availableHours}
            percent={capacity.utilization?.plannedPercent ?? 0}
            tone="primary"
          />
          <CapacityBar
            label="实际消耗"
            value={capacity.actualHours}
            total={capacity.availableHours}
            percent={capacity.utilization?.actualPercent ?? 0}
            tone="done"
          />
        </div>
      </section>

      <form action={action} className="ac-card overflow-hidden">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="sprintId" value={capacity.sprintId} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <UsersRound className="h-4 w-4 text-primary" aria-hidden />
              成员可用工时
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              {editable
                ? "填写该成员在本迭代内可用于项目工作的总小时数。"
                : capacity.status === "closed"
                  ? "已关闭迭代的容量只读。"
                  : "当前角色只能查看容量。"}
            </p>
          </div>
          {editable && (
            <button disabled={pending} className="ac-btn">
              <Save className="h-4 w-4" aria-hidden />
              {pending ? "保存中…" : "保存容量"}
            </button>
          )}
        </div>

        <div className="divide-y divide-line">
          {capacity.members.map((member) => (
            <div
              key={member.userId}
              className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{member.name}</p>
                <p className="text-xs text-ink-faint">{ROLE_LABEL[member.role]}</p>
              </div>
              <input
                name={`hours_${member.userId}`}
                type="number"
                min={0}
                max={1000}
                step={0.5}
                defaultValue={member.availableHours}
                disabled={!editable || pending}
                className="ac-field text-sm"
                aria-label={`${member.name} 可用工时`}
              />
              <p className="text-right text-xs tabular-nums text-ink-faint">
                {capacity.availableHours > 0
                  ? `${Math.round((member.availableHours / capacity.availableHours) * 100)}% 团队容量`
                  : "未配置"}
              </p>
            </div>
          ))}
        </div>

        {errorOf(state) && (
          <p className="border-t border-line px-4 py-3 text-sm text-high">
            {errorOf(state)}
          </p>
        )}
        {state?.ok && (
          <p className="border-t border-line px-4 py-3 text-sm text-done">
            成员容量已保存。
          </p>
        )}
      </form>
    </div>
  );
}

function CapacityBar({
  label,
  value,
  total,
  percent,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  percent: number;
  tone: "primary" | "done";
}) {
  const over = total > 0 && value > total;
  return (
    <div className="rounded-field bg-sunken/65 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-ink-soft">
          <Gauge className="h-3.5 w-3.5" aria-hidden />
          {label}
        </span>
        <span className={over ? "font-medium text-high" : "tabular-nums text-ink-faint"}>
          {formatHours(value)}h / {formatHours(total)}h
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full rounded-full ${over ? "bg-high" : tone === "done" ? "bg-done" : "bg-primary"}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border border-line px-3 py-2">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
