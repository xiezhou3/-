"use client";

import {
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bug,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Play,
  Plus,
  Settings2,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";
import type {
  AutomationAction,
  AutomationRunStatus,
  AutomationTrigger,
} from "@/db/schema";
import type {
  AutomationActionConfig,
  AutomationConditions,
} from "@/lib/automation";
import {
  createAutomationAction,
  createAutomationTemplateAction,
  deleteAutomationAction,
  toggleAutomationAction,
  type AutomationActionState,
} from "./actions";

type RuleView = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: AutomationTrigger;
  conditions: unknown;
  actionType: AutomationAction;
  actionConfig: unknown;
  lastRunAt: Date | null;
};

type RunView = {
  id: string;
  ruleName: string;
  status: AutomationRunStatus;
  summary: string;
  message: string | null;
  createdAt: Date;
};

type TemplateView = {
  id: string;
  name: string;
  description: string;
  triggerType: AutomationTrigger;
  conditions: AutomationConditions;
  actionType: AutomationAction;
  actionConfig: AutomationActionConfig;
};

const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  task_status_changed: "任务状态变化",
  external_event: "外部集成事件",
  release_status_changed: "Release 状态变化",
};

const ACTION_LABEL: Record<AutomationAction, string> = {
  notify: "发送站内通知",
  create_bug: "创建 Bug",
  set_task_status: "推进任务状态",
};

function errorOf(state: AutomationActionState) {
  return state && !state.ok ? state.error : "";
}

export function AutomationManager({
  projectId,
  canWrite,
  templates,
  rules,
  runs,
}: {
  projectId: string;
  canWrite: boolean;
  templates: TemplateView[];
  rules: RuleView[];
  runs: RunView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const activeRules = rules.filter((rule) => rule.enabled).length;
  const successful = runs.filter((run) => run.status === "success").length;
  const failed = runs.filter((run) => run.status === "failed").length;

  function refresh(result: { ok: boolean; error?: string } | null) {
    if (!result?.ok) {
      setMessage(result?.error ?? "操作失败");
      return;
    }
    setMessage("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <Overview label="启用规则" value={activeRules} icon={Workflow} />
        <Overview label="成功执行" value={successful} icon={CheckCircle2} />
        <Overview label="失败执行" value={failed} icon={XCircle} danger={failed > 0} />
      </section>

      {canWrite && (
        <section className="space-y-3">
          <SectionTitle title="常用自动化模板" detail="点击一次即可创建规则" />
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className="ac-card flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-field bg-primary-soft text-primary">
                    {template.actionType === "create_bug" ? (
                      <Bug className="h-4 w-4" aria-hidden />
                    ) : template.actionType === "notify" ? (
                      <Bell className="h-4 w-4" aria-hidden />
                    ) : (
                      <Play className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <div>
                    <h3 className="font-medium text-ink">{template.name}</h3>
                    <p className="mt-1 text-xs text-ink-faint">{template.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="ac-badge bg-sunken text-ink-soft">
                    {TRIGGER_LABEL[template.triggerType]}
                  </span>
                  <span className="ac-badge bg-primary-soft text-primary">
                    {ACTION_LABEL[template.actionType]}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      refresh(
                        await createAutomationTemplateAction({
                          projectId,
                          templateId: template.id,
                        }),
                      );
                    })
                  }
                  className="ac-btn mt-4 self-start px-3 py-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  启用模板
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {canWrite && <CustomRuleForm projectId={projectId} />}
      {message && (
        <p className="rounded-field bg-high-soft px-3 py-2 text-sm text-high">
          {message}
        </p>
      )}

      <section className="space-y-3">
        <SectionTitle
          title="已配置规则"
          detail={`${rules.length} 条规则，${activeRules} 条启用`}
        />
        {rules.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-strong bg-sunken/50 p-8 text-center">
            <Workflow className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
            <p className="mt-2 text-sm text-ink-faint">还没有自动化规则。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                projectId={projectId}
                rule={rule}
                canWrite={canWrite}
              />
            ))}
          </div>
        )}
      </section>

      <section className="ac-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              执行日志
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">最近 40 次规则执行结果</p>
          </div>
          <span className="text-xs tabular-nums text-ink-faint">
            {runs.length} 条
          </span>
        </div>
        {runs.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-faint">
            规则尚未触发。
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => (
              <li key={run.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 ${runTone(run.status)}`}>
                  {run.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : run.status === "failed" ? (
                    <XCircle className="h-4 w-4" aria-hidden />
                  ) : (
                    <Clock3 className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{run.ruleName}</p>
                    <span className={`ac-badge ${runBadge(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    {run.summary}
                    {run.message ? ` · ${run.message}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-ink-faint">
                  {formatDate(run.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RuleRow({
  projectId,
  rule,
  canWrite,
}: {
  projectId: string;
  rule: RuleView;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <article className="ac-card flex flex-wrap items-center gap-3 p-4">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-field ${
          rule.enabled
            ? "bg-done/12 text-done"
            : "bg-sunken text-ink-faint"
        }`}
      >
        <Workflow className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-ink">{rule.name}</h3>
          <span className="ac-badge bg-sunken text-ink-soft">
            {TRIGGER_LABEL[rule.triggerType]}
          </span>
          <span className="ac-badge bg-primary-soft text-primary">
            {ACTION_LABEL[rule.actionType]}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          {describeConditions(rule.conditions)}
          {rule.lastRunAt ? ` · 最近执行 ${formatDate(rule.lastRunAt)}` : ""}
        </p>
      </div>
      {canWrite && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await toggleAutomationAction({
                  projectId,
                  ruleId: rule.id,
                  enabled: !rule.enabled,
                });
                router.refresh();
              })
            }
            className={`relative h-6 w-11 rounded-full transition-colors ${
              rule.enabled ? "bg-done" : "bg-line-strong"
            }`}
            aria-label={rule.enabled ? "停用规则" : "启用规则"}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                rule.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`删除自动化规则“${rule.name}”？`)) return;
              startTransition(async () => {
                await deleteAutomationAction({ projectId, ruleId: rule.id });
                router.refresh();
              });
            }}
            className="text-ink-faint hover:text-high"
            aria-label="删除规则"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </article>
  );
}

function CustomRuleForm({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<AutomationTrigger>("external_event");
  const [action, setAction] = useState<AutomationAction>("notify");
  const [state, formAction, pending] = useActionState<
    AutomationActionState,
    FormData
  >(createAutomationAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <section className="ac-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Settings2 className="h-4 w-4 text-primary" aria-hidden />
            自定义规则
          </span>
          <span className="mt-0.5 block text-xs text-ink-faint">
            组合触发条件、过滤条件和动作
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <form action={formAction} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="规则名称">
            <input name="name" className="ac-field" placeholder="例如：CI 失败创建 Bug" required />
          </Field>
          <Field label="触发类型">
            <select
              name="triggerType"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value as AutomationTrigger)}
              className="ac-field"
            >
              {Object.entries(TRIGGER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-ink-soft">规则说明</span>
            <textarea name="description" rows={2} className="ac-field resize-y" />
          </label>

          {trigger === "external_event" && (
            <>
              <Field label="外部事件类型">
                <select name="eventType" defaultValue="pipeline" className="ac-field">
                  <option value="pipeline">pipeline</option>
                  <option value="pull_request">pull_request</option>
                  <option value="deployment">deployment</option>
                  <option value="push">push</option>
                </select>
              </Field>
              <Field label="外部事件状态">
                <select name="eventStatus" defaultValue="failure" className="ac-field">
                  <option value="">不限</option>
                  <option value="success">success</option>
                  <option value="failure">failure</option>
                  <option value="merged">merged</option>
                  <option value="pending">pending</option>
                </select>
              </Field>
            </>
          )}
          {trigger === "task_status_changed" && (
            <>
              <Field label="原状态">
                <select name="conditionFromStatus" defaultValue="" className="ac-field">
                  <option value="">不限</option>
                  <option value="todo">待办</option>
                  <option value="doing">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </Field>
              <Field label="目标状态">
                <select name="conditionToStatus" defaultValue="done" className="ac-field">
                  <option value="">不限</option>
                  <option value="todo">待办</option>
                  <option value="doing">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </Field>
              <Field label="工作项类型">
                <select name="conditionWorkItemType" defaultValue="" className="ac-field">
                  <option value="">不限</option>
                  <option value="epic">Epic</option>
                  <option value="story">Story</option>
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                </select>
              </Field>
              <Field label="优先级">
                <select name="conditionPriority" defaultValue="" className="ac-field">
                  <option value="">不限</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </Field>
            </>
          )}
          {trigger === "release_status_changed" && (
            <Field label="Release 新状态">
              <select name="conditionReleaseStatus" defaultValue="released" className="ac-field">
                <option value="planned">计划中</option>
                <option value="active">进行中</option>
                <option value="released">已发布</option>
                <option value="cancelled">已取消</option>
              </select>
            </Field>
          )}

          <Field label="执行动作">
            <select
              name="actionType"
              value={action}
              onChange={(event) => setAction(event.target.value as AutomationAction)}
              className="ac-field"
            >
              {Object.entries(ACTION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {action === "notify" && (
            <Field label="通知对象">
              <select name="recipient" defaultValue="admins" className="ac-field">
                <option value="admins">项目管理员</option>
                <option value="assignees">关联任务负责人</option>
                <option value="watchers">关联任务关注者</option>
                <option value="creator">规则创建者</option>
              </select>
            </Field>
          )}
          {action === "create_bug" && (
            <Field label="Bug 严重程度">
              <select name="bugSeverity" defaultValue="major" className="ac-field">
                <option value="blocker">阻断</option>
                <option value="critical">严重</option>
                <option value="major">一般</option>
                <option value="minor">轻微</option>
              </select>
            </Field>
          )}
          {action === "set_task_status" && (
            <Field label="推进到状态">
              <select name="actionTaskStatus" defaultValue="doing" className="ac-field">
                <option value="todo">待办</option>
                <option value="doing">进行中</option>
                <option value="done">已完成</option>
              </select>
            </Field>
          )}
          <Field label="通知/任务标题模板">
            <input
              name="titleTemplate"
              className="ac-field"
              placeholder="例如：CI 失败：{{title}}"
            />
          </Field>
          <Field label="通知/任务说明模板">
            <input
              name="bodyTemplate"
              className="ac-field"
              placeholder="支持 {{title}}、{{eventType}}、{{status}}"
            />
          </Field>
          {errorOf(state) && (
            <p className="text-sm text-high sm:col-span-2">{errorOf(state)}</p>
          )}
          {state?.ok && (
            <p className="text-sm text-done sm:col-span-2">规则已创建。</p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ac-btn-ghost"
            >
              取消
            </button>
            <button disabled={pending} className="ac-btn">
              {pending ? "保存中…" : "创建规则"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Overview({
  label,
  value,
  icon: Icon,
  danger = false,
}: {
  label: string;
  value: number;
  icon: typeof Workflow;
  danger?: boolean;
}) {
  return (
    <div className="ac-card flex items-center gap-3 p-4">
      <span
        className={`grid h-9 w-9 place-items-center rounded-field ${
          danger ? "bg-high-soft text-high" : "bg-primary-soft text-primary"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <p className="text-xs text-ink-faint">{label}</p>
        <p className="mt-0.5 font-display text-xl font-semibold tabular-nums text-ink">
          {value}
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-2">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="text-xs text-ink-faint">{detail}</p>
    </div>
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

function describeConditions(value: unknown) {
  const conditions = (value && typeof value === "object" ? value : {}) as AutomationConditions;
  const parts = [
    conditions.eventType && `事件 ${conditions.eventType}`,
    conditions.eventStatus && `状态 ${conditions.eventStatus}`,
    conditions.fromStatus && `从 ${conditions.fromStatus}`,
    conditions.toStatus && `到 ${conditions.toStatus}`,
    conditions.workItemType && `类型 ${conditions.workItemType}`,
    conditions.priority && `优先级 ${conditions.priority}`,
    conditions.releaseStatus && `Release ${conditions.releaseStatus}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "无附加条件";
}

function runTone(status: AutomationRunStatus) {
  return status === "success"
    ? "text-done"
    : status === "failed"
      ? "text-high"
      : "text-medium";
}

function runBadge(status: AutomationRunStatus) {
  return status === "success"
    ? "bg-done/12 text-done"
    : status === "failed"
      ? "bg-high-soft text-high"
      : "bg-medium-soft text-medium";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
