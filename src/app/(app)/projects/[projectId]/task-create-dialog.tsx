"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import type { BoardTask } from "./board";
import { createTaskAction } from "./actions";

type MemberOption = { id: string; name: string };
type MilestoneOption = { id: string; name: string };

const STATUS_LABEL = {
  todo: "待办",
  doing: "待审核",
  done: "已完成",
} as const;

export function TaskCreateDialog({
  projectId,
  status,
  members,
  milestones,
  onClose,
  onCreated,
}: {
  projectId: string;
  status: "todo" | "doing" | "done";
  members: MemberOption[];
  milestones: MilestoneOption[];
  onClose: () => void;
  onCreated: (task: BoardTask) => void;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    if (pending) return;
    setError("");
    startTransition(async () => {
      const result = await createTaskAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const { task } = result;
      const assignees = task.assigneeIds
        .map((id) => {
          const member = members.find((item) => item.id === id);
          return member ? { id: member.id, name: member.name } : null;
        })
        .filter((item): item is MemberOption => item !== null);
      onCreated({
        id: task.id,
        title: task.title,
        description: task.description,
        completionNote: task.completionNote,
        status: task.status,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        assigneeName:
          assignees.map((assignee) => assignee.name).join("、") || null,
        assigneeId: task.assigneeId,
        assigneeIds: task.assigneeIds,
        assignees,
        milestoneId: task.milestoneId,
        labels: [],
      });
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="关闭新建任务"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        disabled={pending}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`在${STATUS_LABEL[status]}中新建任务`}
        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-pop sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">新建任务</h2>
            <p className="mt-1 text-sm text-ink-soft">
              添加到 <span className="font-medium text-primary">{STATUS_LABEL[status]}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-field text-ink-soft hover:bg-sunken disabled:opacity-40"
            aria-label="关闭"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form action={submit} className="mt-4 space-y-3">
          <fieldset disabled={pending} className="space-y-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="status" value={status} />
            <input
              name="title"
              placeholder="任务标题"
              className="ac-field"
              autoFocus
              required
            />
            <textarea
              name="description"
              placeholder="任务描述（可选）"
              rows={3}
              className="ac-field resize-y"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">负责人</span>
                <select
                  multiple
                  name="assigneeIds"
                  defaultValue={[]}
                  className="ac-field"
                  size={Math.min(5, Math.max(2, members.length))}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">里程碑</span>
                <select name="milestoneId" defaultValue="" className="ac-field">
                  <option value="">无里程碑</option>
                  {milestones.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">优先级</span>
                <select name="priority" defaultValue="medium" className="ac-field">
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-ink-soft">开始日期</span>
                  <input type="date" name="startDate" className="ac-field" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-ink-soft">截止日期</span>
                  <input type="date" name="dueDate" className="ac-field" />
                </label>
              </div>
            </div>
          </fieldset>

          {error && <p className="text-sm text-high">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="ac-btn-ghost"
            >
              取消
            </button>
            <button disabled={pending} className="ac-btn">
              {pending ? "创建中…" : "创建任务"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
