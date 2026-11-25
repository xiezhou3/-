"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { DraftCards, type Draft } from "./draft-cards";
import { AiSettingsPanel, AiStatusBadge } from "./ai-settings-panel";
import type { AiSettingsView } from "@/types/ai-settings";

type Option = { id: string; name: string };
type Msg = { role: "user" | "assistant"; content: string; drafts?: Draft[] };

export function ChatPanel({
  projectId,
  initialMessages,
  members,
  milestones,
  aiSettings,
}: {
  projectId: string;
  initialMessages: Msg[];
  members: Option[];
  milestones: Option[];
  aiSettings: AiSettingsView;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ai, setAi] = useState<AiSettingsView>(aiSettings);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, userText: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message: string = data.error ?? "对话失败";
        setError(message);
        // 没配密钥时直接把设置面板推到眼前，省得用户猜去哪配
        if (/API Key|AI 设置/.test(message)) setSettingsOpen(true);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.text, drafts: data.drafts }]);
    } catch {
      setError("网络异常，请重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="ac-card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium text-ink">项目助手</h2>
          <AiStatusBadge view={ai} />
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          aria-label="AI 接口设置"
          title="AI 接口设置"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-field border border-line-strong bg-surface text-ink-soft transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {settingsOpen && (
        <AiSettingsPanel view={ai} onChange={setAi} onClose={() => setSettingsOpen(false)} />
      )}

      <div className="max-h-96 space-y-2 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`rounded-lg p-2.5 text-sm ${m.role === "user" ? "bg-sunken" : "bg-primary-soft"}`}>
              <span className="mr-2 text-xs text-ink-faint">{m.role === "user" ? "我" : "助手"}</span>
              <span className="whitespace-pre-wrap text-ink">{m.content}</span>
            </div>
            {m.drafts && m.drafts.length > 0 && (
              <DraftCards projectId={projectId} drafts={m.drafts} members={members} milestones={milestones} />
            )}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-ink-soft">向助手提问，如「当前进度如何？」或「把调研拆成任务」</p>
        )}
      </div>
      {error && <p className="text-sm text-high">{error}</p>}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="问点什么…"
          className="ac-field flex-1 text-sm"
          disabled={pending}
        />
        <button onClick={send} disabled={pending} className="ac-btn px-3 py-2 text-sm">
          {pending ? "思考中…" : "发送"}
        </button>
      </div>
    </section>
  );
}
