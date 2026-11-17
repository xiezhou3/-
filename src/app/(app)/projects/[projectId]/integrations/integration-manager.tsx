"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  GitBranch,
  GitMerge,
  Globe2,
  RefreshCw,
  Send,
  Workflow,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type {
  IntegrationProvider,
} from "@/db/schema";
import type { ProjectIntegration } from "@/lib/integrations";
import {
  rotateIntegrationKeyAction,
  saveIntegrationAction,
  sendTestIntegrationEventAction,
  type IntegrationActionState,
} from "./actions";

type IntegrationCardData = {
  provider: IntegrationProvider;
  defaultName: string;
  integration: ProjectIntegration | null;
};

type EventView = {
  id: string;
  integrationName: string;
  provider: IntegrationProvider;
  eventType: string;
  title: string;
  url: string | null;
  actor: string | null;
  branch: string | null;
  commitSha: string | null;
  environment: string | null;
  status: string | null;
  releaseId: string | null;
  occurredAt: string;
  taskIds: string[];
  taskTitles: string[];
};

const PROVIDER_META: Record<
  IntegrationProvider,
  { label: string; description: string; icon: LucideIcon; tone: string }
> = {
  github: {
    label: "GitHub",
    description: "同步 Commit、Pull Request、Actions 和 Deployment。",
    icon: GitBranch,
    tone: "bg-ink text-white",
  },
  gitlab: {
    label: "GitLab",
    description: "同步 Commit、Merge Request、Pipeline 和 Deployment。",
    icon: GitMerge,
    tone: "bg-accent-soft text-accent",
  },
  ci: {
    label: "CI / CD",
    description: "接收任意流水线事件，在任务与 Release 中显示构建状态。",
    icon: Workflow,
    tone: "bg-primary-soft text-primary",
  },
  webhook: {
    label: "通用 Webhook",
    description: "用标准 JSON 从任意自动化系统推送事件。",
    icon: Webhook,
    tone: "bg-medium-soft text-medium",
  },
};

function errorOf(state: IntegrationActionState) {
  return state && !state.ok ? state.error : "";
}

export function IntegrationManager({
  projectId,
  canWrite,
  baseUrl,
  integrations,
  events,
}: {
  projectId: string;
  canWrite: boolean;
  baseUrl: string;
  integrations: IntegrationCardData[];
  events: EventView[];
}) {
  const connected = integrations.filter((item) => item.integration).length;
  const recentSuccess = events.filter((event) =>
    ["success", "succeeded", "passed", "merged"].includes(
      (event.status ?? "").toLowerCase(),
    ),
  ).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <Overview
          label="已连接集成"
          value={`${connected} / ${integrations.length}`}
          icon={Globe2}
        />
        <Overview
          label="最近事件"
          value={String(events.length)}
          icon={Webhook}
        />
        <Overview
          label="成功事件"
          value={String(recentSuccess)}
          icon={Check}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {integrations.map((item) => (
          <IntegrationCard
            key={item.provider}
            projectId={projectId}
            baseUrl={baseUrl}
            canWrite={canWrite}
            data={item}
          />
        ))}
      </section>

      <section className="ac-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">
              最近外部事件
            </h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              任务编号、分支或提交说明中的 `#编号` 会自动关联任务。
            </p>
          </div>
          <span className="text-xs tabular-nums text-ink-faint">
            最近 {events.length} 条
          </span>
        </div>
        {events.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Webhook className="mx-auto h-6 w-6 text-ink-faint" aria-hidden />
            <p className="mt-2 text-sm text-ink-faint">还没有收到外部事件。</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((event) => (
              <EventRow key={event.id} projectId={projectId} event={event} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IntegrationCard({
  projectId,
  baseUrl,
  canWrite,
  data,
}: {
  projectId: string;
  baseUrl: string;
  canWrite: boolean;
  data: IntegrationCardData;
}) {
  const router = useRouter();
  const meta = PROVIDER_META[data.provider];
  const Icon = meta.icon;
  const integration = data.integration;
  const [state, action, saving] = useActionState<
    IntegrationActionState,
    FormData
  >(saveIntegrationAction, null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const webhookUrl = integration
    ? `${baseUrl}/api/integrations/webhooks/${integration.webhookKey}`
    : "";

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <article className="ac-card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-field ${meta.tone}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">
              {meta.label}
            </h2>
            <span
              className={`ac-badge ${
                integration?.status === "active"
                  ? "bg-done/12 text-done"
                  : integration
                    ? "bg-high-soft text-high"
                    : "bg-sunken text-ink-soft"
              }`}
            >
              {integration
                ? integration.status === "active"
                  ? "已连接"
                  : "已停用"
                : "未连接"}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-faint">{meta.description}</p>
          {integration?.lastEventAt && (
            <p className="mt-1 text-[11px] text-ink-faint">
              最近事件 {formatDateTime(integration.lastEventAt)}
            </p>
          )}
        </div>
      </div>

      <form action={action} className="space-y-2 border-t border-line p-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="provider" value={data.provider} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="显示名称">
            <input
              name="name"
              className="ac-field text-sm"
              defaultValue={integration?.name ?? data.defaultName}
              disabled={!canWrite || saving}
            />
          </Field>
          <Field label="状态">
            <select
              name="status"
              className="ac-field text-sm"
              defaultValue={integration?.status ?? "active"}
              disabled={!canWrite || saving}
            >
              <option value="active">启用</option>
              <option value="paused">停用</option>
            </select>
          </Field>
        </div>
        {data.provider === "github" || data.provider === "gitlab" ? (
          <Field label="仓库地址">
            <input
              name="repositoryUrl"
              className="ac-field text-sm"
              defaultValue={integration?.repositoryUrl ?? ""}
              placeholder="https://github.com/team/repo"
              disabled={!canWrite || saving}
            />
          </Field>
        ) : (
          <input type="hidden" name="repositoryUrl" value="" />
        )}
        {canWrite && (
          <div className="flex justify-end">
            <button disabled={saving} className="ac-btn px-3 py-1.5 text-xs">
              {saving ? "保存中…" : integration ? "保存配置" : "连接"}
            </button>
          </div>
        )}
        {errorOf(state) && <p className="text-xs text-high">{errorOf(state)}</p>}
        {state?.ok && <p className="text-xs text-done">配置已保存。</p>}
      </form>

      {integration && (
        <div className="space-y-3 border-t border-line bg-sunken/40 p-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink-soft">Webhook URL</span>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={webhookUrl}
                className="ac-field min-w-0 text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                }}
                className="ac-btn-ghost shrink-0 px-2"
                aria-label="复制 Webhook URL"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </label>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMessage("");
                  startTransition(async () => {
                    const result = await sendTestIntegrationEventAction({
                      projectId,
                      integrationId: integration.id,
                    });
                    if (!result?.ok) {
                      setMessage(result?.error ?? "测试事件发送失败");
                      return;
                    }
                    setMessage("测试事件已发送。");
                    router.refresh();
                  });
                }}
                className="ac-btn px-3 py-1.5 text-xs"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                发送测试事件
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm("轮换后旧 Webhook URL 会立即失效，继续？")) return;
                  setMessage("");
                  startTransition(async () => {
                    const result = await rotateIntegrationKeyAction({
                      projectId,
                      integrationId: integration.id,
                    });
                    if (!result?.ok) {
                      setMessage(result?.error ?? "密钥轮换失败");
                      return;
                    }
                    setMessage("Webhook 密钥已轮换。");
                    router.refresh();
                  });
                }}
                className="ac-btn-ghost px-3 py-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                轮换密钥
              </button>
              {message && (
                <span className={`text-xs ${message.includes("已") ? "text-done" : "text-high"}`}>
                  {message}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function EventRow({ projectId, event }: { projectId: string; event: EventView }) {
  const success = ["success", "succeeded", "passed", "merged"].includes(
    (event.status ?? "").toLowerCase(),
  );
  const failed = ["failure", "failed", "error", "cancelled"].includes(
    (event.status ?? "").toLowerCase(),
  );
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-field ${
          failed
            ? "bg-high-soft text-high"
            : success
              ? "bg-done/12 text-done"
              : "bg-primary-soft text-primary"
        }`}
      >
        {event.provider === "ci" ? (
          <Workflow className="h-4 w-4" aria-hidden />
        ) : (
          <Webhook className="h-4 w-4" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-ink">{event.title}</p>
          <span className="ac-badge bg-sunken text-ink-soft">
            {event.eventType}
          </span>
          {event.status && (
            <span
              className={`ac-badge ${
                failed
                  ? "bg-high-soft text-high"
                  : success
                    ? "bg-done/12 text-done"
                    : "bg-medium-soft text-medium"
              }`}
            >
              {event.status}
            </span>
          )}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-faint">
          <span>{event.integrationName}</span>
          {event.actor && <span>{event.actor}</span>}
          {event.branch && <span className="font-mono">{event.branch}</span>}
          {event.commitSha && (
            <span className="font-mono">{event.commitSha.slice(0, 8)}</span>
          )}
          {event.environment && <span>{event.environment}</span>}
          <span>{formatDateTime(new Date(event.occurredAt))}</span>
        </p>
        {(event.taskIds.length > 0 || event.releaseId) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {event.taskIds.map((taskId, index) => (
              <a
                key={taskId}
                href={`/projects/${projectId}?task=${taskId}&sprint=all`}
                className="ac-badge bg-primary-soft text-primary hover:underline"
              >
                {event.taskTitles[index] ?? "关联任务"}
              </a>
            ))}
            {event.releaseId && (
              <a
                href={`/projects/${projectId}/releases/${event.releaseId}`}
                className="ac-badge bg-accent-soft text-accent hover:underline"
              >
                查看 Release
              </a>
            )}
          </div>
        )}
      </div>
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-primary hover:underline"
        >
          打开
        </a>
      )}
    </li>
  );
}

function Overview({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Globe2;
}) {
  return (
    <div className="ac-card flex items-center gap-3 p-4">
      <span className="grid h-9 w-9 place-items-center rounded-field bg-primary-soft text-primary">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
