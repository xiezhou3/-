"use client";

import {
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Link2, Send } from "lucide-react";
import {
  addTaskAttachmentAction,
  deleteTaskAction,
  submitTaskForReviewAction,
  updateTaskAction,
  type FormState,
  type UpdateTaskState,
} from "./actions";
import { LABEL_COLOR_CLASS } from "@/lib/board-columns";
import type { BoardTask } from "./board";

export type Option = { id: string; name: string };
type TaskOption = { id: string; title: string };

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-high-soft text-high",
  medium: "bg-medium-soft text-medium",
  low: "bg-low-soft text-low",
};

export function TaskCard({
  task,
  projectId,
  canEdit,
  canSubmit,
  members,
  milestones,
  allTasks,
  allLabels,
  dependencies,
}: {
  task: BoardTask;
  projectId: string;
  canEdit: boolean;
  canSubmit: boolean;
  members: Option[];
  milestones: Option[];
  allTasks: TaskOption[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [attachments, setAttachments] = useState(task.attachments);
  const [actionError, setActionError] = useState("");
  const [submitting, startSubmit] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 深链 /projects/[id]?task=<taskId>：命中本卡片则打开详情弹窗（仅管理员有 EditModal）。
  // 于渲染期调整而非 useEffect：避免多渲染一轮，且用户手动关闭后不会被 effect 重开。
  const deepLinked = canEdit && searchParams.get("task") === task.id;
  const [prevDeepLinked, setPrevDeepLinked] = useState(false);
  if (deepLinked !== prevDeepLinked) {
    setPrevDeepLinked(deepLinked);
    if (deepLinked) setEditing(true);
  }
  const successorTitles = dependencies
    .filter((d) => d.predecessorId === task.id)
    .map((d) => allTasks.find((t) => t.id === d.successorId)?.title)
    .filter((title): title is string => Boolean(title));

  return (
    <div
      data-task-id={task.id}
      className="ac-card min-h-28 p-3 text-sm transition hover:shadow-md"
    >
      <TaskCardContent
        task={{ ...task, attachments }}
        successorTitles={successorTitles}
      />

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-ink-faint hover:text-primary hover:underline"
          >
            编辑
          </button>
        )}
        {canSubmit && task.status === "todo" && (
          <button
            type="button"
            onClick={() => setAddingLink(true)}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            添加文件链接
          </button>
        )}
        {canSubmit && task.status === "todo" && attachments.length > 0 && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setActionError("");
              startSubmit(async () => {
                const result = await submitTaskForReviewAction({
                  taskId: task.id,
                  projectId,
                });
                if (!result.ok) {
                  setActionError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {submitting ? "提交中…" : "提交审核"}
          </button>
        )}
      </div>
      {actionError && <p className="mt-2 text-xs text-high">{actionError}</p>}

      {addingLink && (
        <AttachmentDialog
          taskId={task.id}
          projectId={projectId}
          onClose={() => setAddingLink(false)}
          onCreated={(attachment) => {
            setAttachments((current) => [...current, attachment]);
            setAddingLink(false);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <EditModal
          task={task}
          projectId={projectId}
          members={members}
          milestones={milestones}
          allTasks={allTasks}
          allLabels={allLabels}
          dependencies={dependencies}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

export function TaskCardContent({
  task,
  successorTitles,
}: {
  task: BoardTask;
  successorTitles: string[];
}) {
  return (
    <div>
      <p className="font-medium text-ink">{task.title}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
        <span>
          {task.assignees.length > 0
            ? task.assignees.map((assignee) => assignee.name).join("、")
            : "未分配"}
        </span>
        {(task.startDate || task.dueDate) && (
          <span>· {task.startDate ?? "…"}→{task.dueDate ?? "…"}</span>
        )}
        <span className={`ac-badge ${PRIORITY_BADGE[task.priority] ?? "bg-low-soft text-low"}`}>
          {task.priority}
        </span>
      </p>
      {task.attachments.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {task.attachments.slice(0, 3).map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{attachment.name}</span>
            </a>
          ))}
          {task.attachments.length > 3 && (
            <span className="text-ink-faint">+{task.attachments.length - 3}</span>
          )}
        </p>
      )}
      {task.labels.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <span
              key={l.id}
              className={`ac-badge ${LABEL_COLOR_CLASS[l.color] ?? LABEL_COLOR_CLASS.slate}`}
            >
              {l.name}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span className="text-xs text-ink-faint">+{task.labels.length - 3}</span>
          )}
        </p>
      )}
      {task.description && (
        <p className="mt-1 text-xs text-ink-soft line-clamp-2">{task.description}</p>
      )}
      {task.status === "done" && task.completionNote && (
        <p className="mt-1 rounded bg-done/10 px-2 py-1 text-xs text-done">
          完成情况：{task.completionNote}
        </p>
      )}
      {successorTitles.length > 0 && (
        <p className="mt-1 text-xs text-ink-faint">后置：{successorTitles.join("、")}</p>
      )}
    </div>
  );
}

function AttachmentDialog({
  taskId,
  projectId,
  onClose,
  onCreated,
}: {
  taskId: string;
  projectId: string;
  onClose: () => void;
  onCreated: (attachment: BoardTask["attachments"][number]) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await addTaskAttachmentAction({
        taskId,
        projectId,
        name: name.trim() || undefined,
        url,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.attachment);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="添加任务文件链接"
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        disabled={pending}
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
      />
      <form onSubmit={submit} className="relative z-10 w-full max-w-md ac-card space-y-4 p-5 shadow-pop">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">添加文件链接</h3>
          <p className="mt-1 text-sm text-ink-soft">把交付文件链接附在任务上，再提交审核。</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-soft">链接名称（可选）</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="ac-field"
            placeholder="例如：设计稿、实验报告"
            disabled={pending}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-ink-soft">文件链接</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            type="url"
            required
            className="ac-field"
            placeholder="https://..."
            disabled={pending}
          />
        </label>
        {error && <p className="text-sm text-high">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="ac-btn-ghost">
            取消
          </button>
          <button disabled={pending || !url.trim()} className="ac-btn">
            {pending ? "添加中…" : "添加链接"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditModal({
  task,
  projectId,
  members,
  milestones,
  allTasks,
  allLabels,
  dependencies,
  onClose,
}: {
  task: BoardTask;
  projectId: string;
  members: Option[];
  milestones: Option[];
  allTasks: TaskOption[];
  allLabels: Option[];
  dependencies: { predecessorId: string; successorId: string }[];
  onClose: () => void;
}) {
  const [updateState, updateFormAction, updating] = useActionState<UpdateTaskState, FormData>(
    updateTaskAction,
    null,
  );
  const [deleteState, deleteFormAction, deleting] = useActionState<FormState, FormData>(
    deleteTaskAction,
    null,
  );

  // 保存成功（action 回 { ok: true }）即关窗
  useEffect(() => {
    if (updateState && "ok" in updateState) onClose();
  }, [updateState, onClose]);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateError = updateState && "error" in updateState ? updateState.error : null;
  const deleteError = deleteState && "error" in deleteState ? deleteState.error : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="编辑任务"
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-ink/45 backdrop-blur-sm"
      />
      <div className="relative z-10 my-auto w-full max-w-md ac-card p-5 shadow-pop">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-ink">编辑任务</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid h-7 w-7 place-items-center rounded-field text-ink-faint hover:bg-sunken hover:text-ink"
          >
            ✕
          </button>
        </header>

        <form action={updateFormAction} className="space-y-2.5">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="projectId" value={projectId} />

          <Field label="标题">
            <input name="title" defaultValue={task.title} className="ac-field text-sm" />
          </Field>
          <Field label="描述">
            <textarea
              name="description"
              defaultValue={task.description ?? ""}
              rows={2}
              className="ac-field text-sm"
              placeholder="任务描述"
            />
          </Field>
          <Field label="完成情况（完成时填写）">
            <textarea
              name="completionNote"
              defaultValue={task.completionNote ?? ""}
              rows={2}
              className="ac-field text-sm"
              placeholder="完成说明"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="负责人">
              <select
                multiple
                name="assigneeIds"
                defaultValue={task.assigneeIds}
                className="ac-field text-sm"
                size={Math.min(5, Math.max(2, members.length))}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="里程碑">
              <select name="milestoneId" defaultValue={task.milestoneId ?? ""} className="ac-field text-sm">
                <option value="">无里程碑</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="优先级">
              <select name="priority" defaultValue={task.priority} className="ac-field text-sm">
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </Field>
            <Field label="起始日">
              <input type="date" name="startDate" defaultValue={task.startDate ?? ""} className="ac-field text-sm" />
            </Field>
            <Field label="截止日">
              <input type="date" name="dueDate" defaultValue={task.dueDate ?? ""} className="ac-field text-sm" />
            </Field>
          </div>

          {allLabels.length > 0 && (
            <Field label="标签（可多选）">
              <select
                multiple
                name="labelIds"
                defaultValue={task.labels.map((l) => l.id)}
                className="ac-field text-sm"
                size={Math.min(4, Math.max(2, allLabels.length))}
              >
                {allLabels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="后置任务（可多选）">
            <select
              multiple
              name="successorIds"
              defaultValue={dependencies
                .filter((d) => d.predecessorId === task.id)
                .map((d) => d.successorId)}
              className="ac-field text-sm"
              size={Math.min(4, Math.max(2, allTasks.length - 1))}
            >
              {allTasks
                .filter((t) => t.id !== task.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </Field>

          {updateError && <p className="text-sm text-high">{updateError}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="ac-btn-ghost">
              取消
            </button>
            <button disabled={updating} className="ac-btn">
              {updating ? "保存中…" : "保存"}
            </button>
          </div>
        </form>

        <form
          action={deleteFormAction}
          onSubmit={(e) => {
            if (!confirm("确认删除该任务？此操作不可恢复。")) e.preventDefault();
          }}
          className="mt-3 border-t border-line pt-3"
        >
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="projectId" value={projectId} />
          {deleteError && <p className="mb-1 text-xs text-high">{deleteError}</p>}
          <button
            disabled={deleting}
            className="text-xs text-high underline disabled:opacity-50"
          >
            删除任务
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
