"use client";

import { useState } from "react";
import { PlugZap, Save, Trash2 } from "lucide-react";
import type { AiSettingsView } from "@/types/ai-settings";

type Busy = "save" | "test" | "clear" | null;
type Status = { kind: "idle" | "pending" | "ok" | "error"; message?: string };

/** 助手标题旁的状态徽章：已连接 / 用系统密钥 / 未连接 */
export function AiStatusBadge({ view }: { view: AiSettingsView }) {
  if (view.configured) {
    return <span className="ac-badge bg-primary-soft text-primary">已连接</span>;
  }
  if (view.envFallback) {
    return <span className="ac-badge bg-primary-soft text-primary">系统密钥</span>;
  }
  return <span className="ac-badge bg-medium-soft text-medium">未连接 AI</span>;
}

export function AiSettingsPanel({
  view,
  onChange,
  onClose,
}: {
  view: AiSettingsView;
  onChange: (next: AiSettingsView) => void;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(view.baseUrl);
  const [model, setModel] = useState(view.model);
  const [busy, setBusy] = useState<Busy>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function apply(next: AiSettingsView) {
    onChange(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setApiKey("");
  }

  async function call(method: "PUT" | "POST" | "DELETE", body?: unknown) {
    const res = await fetch("/api/ai-settings", {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data } as { ok: boolean; data: Record<string, unknown> };
  }

  async function save() {
    setBusy("save");
    setStatus({ kind: "pending", message: "保存中…" });
    try {
      const { ok, data } = await call("PUT", { apiKey: apiKey.trim(), baseUrl, model });
      if (ok) {
        apply(data as unknown as AiSettingsView);
        setStatus({ kind: "ok", message: "已连接，可直接对话" });
      } else {
        setStatus({ kind: "error", message: String(data.error ?? "保存失败") });
      }
    } catch {
      setStatus({ kind: "error", message: "网络异常，请重试" });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setStatus({ kind: "pending", message: "测试中…" });
    try {
      const { ok, data } = await call("POST", { apiKey: apiKey.trim(), baseUrl, model });
      if (ok) setStatus({ kind: "ok", message: `连接正常（${String(data.model)}）` });
      else setStatus({ kind: "error", message: String(data.error ?? "连接失败") });
    } catch {
      setStatus({ kind: "error", message: "网络异常，请重试" });
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    setStatus({ kind: "pending", message: "清除中…" });
    try {
      const { ok, data } = await call("DELETE");
      if (ok) {
        const next = data as unknown as AiSettingsView;
        apply(next);
        setStatus({
          kind: "ok",
          message: next.envFallback ? "已清除，改用服务端密钥" : "已清除",
        });
      } else {
        setStatus({ kind: "error", message: String(data.error ?? "清除失败") });
      }
    } catch {
      setStatus({ kind: "error", message: "网络异常，请重试" });
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <form
      className="space-y-3 rounded-md border border-line bg-sunken/70 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-soft">AI 接口设置</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-ink-faint transition-colors hover:text-ink"
        >
          收起
        </button>
      </div>

      <label className="block space-y-1">
        <span className="block text-xs text-ink-soft">API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={view.keyHint ?? "sk-…"}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className="ac-field text-sm"
        />
        {view.keyHint && (
          <span className="block text-[11px] text-ink-faint">
            已存 {view.keyHint}，留空即不改动
          </span>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="block text-xs text-ink-soft">接口地址</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            spellCheck={false}
            disabled={disabled}
            className="ac-field text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="block text-xs text-ink-soft">模型</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            spellCheck={false}
            disabled={disabled}
            className="ac-field text-sm"
          />
        </label>
      </div>

      {status.message && (
        <p
          className={`text-xs ${
            status.kind === "error"
              ? "text-high"
              : status.kind === "ok"
                ? "text-done"
                : "text-ink-soft"
          }`}
        >
          {status.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={disabled} className="ac-btn px-3 py-1.5 text-xs">
          <Save className="h-3.5 w-3.5" aria-hidden />
          {busy === "save" ? "保存中…" : "保存并连接"}
        </button>
        <button
          type="button"
          onClick={() => void test()}
          disabled={disabled}
          className="ac-btn-ghost px-3 py-1.5 text-xs"
        >
          <PlugZap className="h-3.5 w-3.5" aria-hidden />
          {busy === "test" ? "测试中…" : "测试连接"}
        </button>
        {view.configured && (
          <button
            type="button"
            onClick={() => void clear()}
            disabled={disabled}
            className="ml-auto inline-flex items-center gap-1 text-xs text-high transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            清除
          </button>
        )}
      </div>
    </form>
  );
}
