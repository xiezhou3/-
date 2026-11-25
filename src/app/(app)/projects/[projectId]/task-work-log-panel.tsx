"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import {
  createTaskWorkLogAction,
  deleteTaskWorkLogAction,
  loadTaskWorkLogsAction,
} from "./task-work-log-actions";

type WorkLog = {
  id: string;
  userId: string | null;
  userName: string | null;
  hours: number;
  workDate: string;
  note: string | null;
  createdAt: string | Date;
};

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function TaskWorkLogPanel({
  taskId,
  projectId,
  estimatedHours,
  currentUserId,
  isAdmin,
}: {
  taskId: string;
  projectId: string;
  estimatedHours: number | null;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await loadTaskWorkLogsAction(taskId);
    setLogs(data.logs);
  }

  useEffect(() => {
    let cancelled = false;
    void loadTaskWorkLogsAction(taskId)
      .then((data) => {
        if (!cancelled) setLogs(data.logs);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "加载工时失败",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const actualHours = logs.reduce((sum, log) => sum + log.hours, 0);

  return (
    <section className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Clock3 className="h-4 w-4 text-primary" aria-hidden />
          工时明细
        </h3>
        <p className="text-xs tabular-nums text-ink-faint">
          实际 {formatHours(actualHours)}h
          {estimatedHours !== null ? ` / 预估 ${formatHours(estimatedHours)}h` : ""}
        </p>
      </div>

      <div className="mt-3 rounded-field border border-line bg-sunken/40 p-3">
        <div className="grid gap-2 sm:grid-cols-[6rem_9rem_minmax(0,1fr)_auto]">
          <input
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            type="number"
            min={0.25}
            max={24}
            step={0.25}
            className="ac-field text-sm"
            placeholder="小时"
            aria-label="工时小时数"
          />
          <input
            value={workDate}
            onChange={(event) => setWorkDate(event.target.value)}
            type="date"
            max={todayKey()}
            className="ac-field text-sm"
            aria-label="工时日期"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="ac-field text-sm"
            placeholder="做了什么（可选）"
            maxLength={500}
            aria-label="工时说明"
          />
          <button
            type="button"
            disabled={pending || !hours || !workDate}
            className="ac-btn whitespace-nowrap text-xs"
            onClick={() => {
              setError("");
              startTransition(async () => {
                const result = await createTaskWorkLogAction({
                  taskId,
                  projectId,
                  hours,
                  workDate,
                  note: note.trim() || undefined,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setHours("");
                setNote("");
                await reload();
              });
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {pending ? "记录中…" : "记工时"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-high">{error}</p>}
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-ink-faint">正在加载工时…</p>
      ) : logs.length === 0 ? (
        <p className="mt-3 text-xs text-ink-faint">暂无工时记录。</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {logs.map((log) => {
            const canDelete = isAdmin || log.userId === currentUserId;
            return (
              <li
                key={log.id}
                className="flex items-start gap-2 rounded-field border border-line bg-surface px-3 py-2 text-xs"
              >
                <span className="w-12 shrink-0 font-medium tabular-nums text-ink">
                  {formatHours(log.hours)}h
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink-soft">
                    {log.userName ?? "已注销用户"} · {log.workDate}
                  </span>
                  {log.note && (
                    <span className="mt-0.5 block whitespace-pre-wrap text-ink-faint">
                      {log.note}
                    </span>
                  )}
                </span>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm("删除这条工时记录？")) return;
                      setError("");
                      startTransition(async () => {
                        const result = await deleteTaskWorkLogAction({
                          workLogId: log.id,
                          projectId,
                        });
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        await reload();
                      });
                    }}
                    className="shrink-0 text-ink-faint hover:text-high"
                    aria-label={`删除 ${log.workDate} 的工时记录`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
}
