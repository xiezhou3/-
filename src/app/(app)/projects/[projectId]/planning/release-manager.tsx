"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Package,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type { ReleaseSummary } from "@/lib/planning";
import type { ReleaseStatus } from "@/db/schema";
import {
  createReleaseAction,
  deleteReleaseAction,
  updateReleaseAction,
  type PlanningActionState,
} from "./actions";

const STATUS_META: Record<
  ReleaseStatus,
  { label: string; className: string }
> = {
  planned: { label: "计划中", className: "bg-medium-soft text-medium" },
  active: { label: "进行中", className: "bg-primary-soft text-primary" },
  released: { label: "已发布", className: "bg-done/12 text-done" },
  cancelled: { label: "已取消", className: "bg-sunken text-ink-soft" },
};

function errorOf(state: PlanningActionState) {
  return state && !state.ok ? state.error : "";
}

export function ReleaseManager({
  projectId,
  releases,
  canWrite,
}: {
  projectId: string;
  releases: ReleaseSummary[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<
    PlanningActionState,
    FormData
  >(createReleaseAction, null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-5">
      {canWrite && (
        <section className="ac-card p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Plus className="h-4 w-4 text-primary" aria-hidden />
            新建版本 / Release
          </h2>
          <form
            ref={formRef}
            action={action}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <Field label="版本名称">
              <input
                name="name"
                className="ac-field"
                placeholder="例如：v1.0 内测版"
                required
              />
            </Field>
            <Field label="状态">
              <select name="status" defaultValue="planned" className="ac-field">
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="开始日期">
              <input name="startDate" type="date" className="ac-field" />
            </Field>
            <Field label="目标日期">
              <input name="targetDate" type="date" className="ac-field" />
            </Field>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-ink-soft">版本说明</span>
              <textarea
                name="description"
                rows={2}
                className="ac-field resize-y"
                placeholder="本次版本希望交付什么？"
              />
            </label>
            {errorOf(state) && (
              <p className="text-sm text-high sm:col-span-2">{errorOf(state)}</p>
            )}
            {state?.ok && (
              <p className="text-sm text-done sm:col-span-2">版本已创建。</p>
            )}
            <div className="flex justify-end sm:col-span-2">
              <button disabled={pending} className="ac-btn">
                {pending ? "创建中…" : "创建版本"}
              </button>
            </div>
          </form>
        </section>
      )}

      {releases.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-sunken/50 p-8 text-center">
          <Package className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
          <p className="mt-2 text-sm text-ink-faint">还没有创建版本。</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {releases.map((release) => (
            <ReleaseCard
              key={release.id}
              projectId={projectId}
              release={release}
              canWrite={canWrite}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReleaseCard({
  projectId,
  release,
  canWrite,
}: {
  projectId: string;
  release: ReleaseSummary;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [updateState, updateAction, updating] = useActionState<
    PlanningActionState,
    FormData
  >(updateReleaseAction, null);
  const [deleteState, deleteAction, deleting] = useActionState<
    PlanningActionState,
    FormData
  >(deleteReleaseAction, null);
  const meta = STATUS_META[release.status];
  const pct =
    release.taskCount > 0
      ? Math.round((release.doneTaskCount / release.taskCount) * 100)
      : 0;

  useEffect(() => {
    if (updateState?.ok || deleteState?.ok) router.refresh();
  }, [updateState, deleteState, router]);

  return (
    <article className="ac-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-lg font-semibold text-ink">
              {release.name}
            </h3>
            <span className={`ac-badge ${meta.className}`}>{meta.label}</span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {release.startDate ?? "未设开始"} → {release.targetDate ?? "未设目标"}
            {release.releaseDate ? ` · 发布于 ${release.releaseDate}` : ""}
          </p>
        </div>
        <span className="text-xs tabular-nums text-ink-faint">
          {release.doneTaskCount}/{release.taskCount} 任务
        </span>
      </div>

      {release.description && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">
          {release.description}
        </p>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-ink-faint">
          <span>
            {release.estimateTotal} SP · 预估 {formatHours(release.estimatedHours)}h ·
            实际 {formatHours(release.actualHours)}h
          </span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-done" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Link
          href={`/projects/${projectId}/releases/${release.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          打开交付看板
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {canWrite && (
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            编辑版本
          </summary>
          <form action={updateAction} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="releaseId" value={release.id} />
            <Field label="版本名称">
              <input name="name" defaultValue={release.name} className="ac-field" required />
            </Field>
            <Field label="状态">
              <select name="status" defaultValue={release.status} className="ac-field">
                {Object.entries(STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="开始日期">
              <input
                name="startDate"
                type="date"
                defaultValue={release.startDate ?? ""}
                className="ac-field"
              />
            </Field>
            <Field label="目标日期">
              <input
                name="targetDate"
                type="date"
                defaultValue={release.targetDate ?? ""}
                className="ac-field"
              />
            </Field>
            <Field label="实际发布日期">
              <input
                name="releaseDate"
                type="date"
                defaultValue={release.releaseDate ?? ""}
                className="ac-field"
              />
            </Field>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-ink-soft">版本说明</span>
              <textarea
                name="description"
                rows={2}
                defaultValue={release.description ?? ""}
                className="ac-field resize-y"
              />
            </label>
            {errorOf(updateState) && (
              <p className="text-xs text-high sm:col-span-2">{errorOf(updateState)}</p>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button disabled={updating} className="ac-btn px-3 py-1.5 text-xs">
                <Save className="h-3.5 w-3.5" aria-hidden />
                {updating ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
          <form
            action={deleteAction}
            className="mt-3 border-t border-line pt-3"
            onSubmit={(event) => {
              if (!confirm(`删除版本“${release.name}”？关联任务会保留并解除版本。`)) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="releaseId" value={release.id} />
            {errorOf(deleteState) && (
              <p className="mb-2 text-xs text-high">{errorOf(deleteState)}</p>
            )}
            <button
              disabled={deleting}
              className="inline-flex items-center gap-1 text-xs text-high hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {deleting ? "删除中…" : "删除版本"}
            </button>
          </form>
        </details>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
