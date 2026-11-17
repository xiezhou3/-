"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  WORK_ITEM_TYPE_DESCRIPTION,
  WORK_ITEM_TYPE_LABEL,
  WORK_ITEM_TYPES,
  type WorkItemTypeValue,
} from "@/lib/work-item";
import type {
  BoardTask,
  ReleaseOption,
  SprintOption,
  WorkItemOption,
} from "./board";
import { createTaskAction } from "./actions";

type MemberOption = { id: string; name: string };
type MilestoneOption = { id: string; name: string };

export function TaskCreateDialog({
  projectId,
  status,
  statusId,
  statusLabel,
  members,
  milestones,
  sprints,
  releases,
  allTasks,
  defaultSprintId,
  onClose,
  onCreated,
}: {
  projectId: string;
  status: "todo" | "doing" | "done";
  statusId: string;
  statusLabel: string;
  members: MemberOption[];
  milestones: MilestoneOption[];
  sprints: SprintOption[];
  releases: ReleaseOption[];
  allTasks: WorkItemOption[];
  defaultSprintId: string | null;
  onClose: () => void;
  onCreated: (task: BoardTask) => void;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [workItemType, setWorkItemType] =
    useState<WorkItemTypeValue>("task");
  const parentType =
    workItemType === "story"
      ? "epic"
      : workItemType === "task" || workItemType === "bug"
        ? "story"
        : null;
  const parentOptions = parentType
    ? allTasks.filter((item) => item.workItemType === parentType)
    : [];

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
        taskNumber: task.taskNumber,
        title: task.title,
        description: task.description,
        completionNote: task.completionNote,
        status: task.status,
        statusId: task.statusId,
        priority: task.priority,
        workItemType: task.workItemType,
        bugSeverity: task.bugSeverity,
        parentWorkItemId: task.parentWorkItemId,
        startDate: task.startDate,
        dueDate: task.dueDate,
        estimate: task.estimate,
        estimatedHours: task.estimatedHours,
        actualHours: 0,
        sprintId: task.sprintId,
        releaseId: task.releaseId,
        assigneeName:
          assignees.map((assignee) => assignee.name).join("、") || null,
        assigneeId: task.assigneeId,
        assigneeIds: task.assigneeIds,
        assignees,
        attachments: [],
        milestoneId: task.milestoneId,
        labels: [],
        commentCount: 0,
        mentioned: false,
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
        aria-label={`在${statusLabel}中新建任务`}
        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-pop sm:p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">新建任务</h2>
            <p className="mt-1 text-sm text-ink-soft">
              添加到 <span className="font-medium text-primary">{statusLabel}</span>
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
            <input type="hidden" name="statusId" value={statusId} />
            <input
              name="title"
              placeholder="任务标题"
              className="ac-field"
              autoFocus
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">工作项类型</span>
                <select
                  name="workItemType"
                  value={workItemType}
                  onChange={(event) =>
                    setWorkItemType(event.target.value as WorkItemTypeValue)
                  }
                  className="ac-field"
                >
                  {WORK_ITEM_TYPES.map((type) => (
                    <option
                      key={type}
                      value={type}
                      title={WORK_ITEM_TYPE_DESCRIPTION[type]}
                    >
                      {WORK_ITEM_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">上级工作项</span>
                {workItemType === "epic" ? (
                  <div className="ac-field text-sm text-ink-faint">
                    Epic 为顶层工作项
                  </div>
                ) : (
                  <select
                    key={workItemType}
                    name="parentWorkItemId"
                    defaultValue=""
                    className="ac-field"
                  >
                    <option value="">无上级</option>
                    {parentOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {WORK_ITEM_TYPE_LABEL[item.workItemType]} · {item.title}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>
            {workItemType === "bug" && (
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">缺陷严重程度</span>
                <select name="bugSeverity" defaultValue="major" className="ac-field">
                  <option value="blocker">阻断</option>
                  <option value="critical">严重</option>
                  <option value="major">一般</option>
                  <option value="minor">轻微</option>
                </select>
              </label>
            )}
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
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">故事点</span>
                <input
                  name="estimate"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="未估算"
                  className="ac-field"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">预估工时（小时）</span>
                <input
                  name="estimatedHours"
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="未估算"
                  className="ac-field"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">迭代</span>
                <select
                  name="sprintId"
                  defaultValue={defaultSprintId ?? ""}
                  className="ac-field"
                >
                  <option value="">Backlog</option>
                  {sprints
                    .filter((sprint) => sprint.status !== "closed")
                    .map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>
                        {sprint.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">版本 / Release</span>
                <select name="releaseId" defaultValue="" className="ac-field">
                  <option value="">未分配版本</option>
                  {releases
                    .filter((release) => release.status !== "cancelled")
                    .map((release) => (
                      <option key={release.id} value={release.id}>
                        {release.name}
                      </option>
                    ))}
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
