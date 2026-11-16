"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FolderOpen, LayoutGrid, MessagesSquare, Sparkles } from "lucide-react";

type TabId = "board" | "files" | "discussion";

const ASSISTANT_KEY = "agilecampus:assistant-open";

export function WorkspaceTabs({
  board,
  files,
  discussion,
  aside,
  boardCount,
  fileCount,
  discussionCount,
}: {
  board: ReactNode;
  files: ReactNode;
  discussion: ReactNode;
  aside: ReactNode;
  boardCount: number;
  fileCount: number;
  discussionCount: number;
}) {
  const [tab, setTab] = useState<TabId>("board");
  const [assistantOpen, setAssistantOpen] = useState(true);

  // 记住上次的展开状态，避免每次进项目都要重新收起
  useEffect(() => {
    const saved = window.localStorage.getItem(ASSISTANT_KEY);
    // 读 localStorage 只能在挂载后进行，故此处同步 setState 是有意为之
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) setAssistantOpen(saved === "1");
  }, []);

  function toggleAssistant() {
    setAssistantOpen((current) => {
      const next = !current;
      window.localStorage.setItem(ASSISTANT_KEY, next ? "1" : "0");
      return next;
    });
  }

  const tabs: Array<{
    id: TabId;
    label: string;
    icon: typeof LayoutGrid;
    count: number;
  }> = [
    { id: "board", label: "看板", icon: LayoutGrid, count: boardCount },
    { id: "files", label: "文件", icon: FolderOpen, count: fileCount },
    { id: "discussion", label: "讨论", icon: MessagesSquare, count: discussionCount },
  ];

  return (
    <div
      className={`grid items-start gap-5 ${
        assistantOpen
          ? "lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
          : ""
      }`}
    >
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="项目工作区"
            className="flex min-w-0 flex-1 gap-1 rounded-xl border border-line bg-surface p-1 shadow-card"
          >
            {tabs.map(({ id, label, icon: Icon, count }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`tab-${id}`}
                  aria-selected={active}
                  aria-controls={`panel-${id}`}
                  onClick={() => setTab(id)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "text-ink-soft hover:bg-primary-soft hover:text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{label}</span>
                  <span
                    className={`tabular-nums text-xs ${
                      active ? "text-white/75" : "text-ink-faint"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={toggleAssistant}
            aria-expanded={assistantOpen}
            aria-controls="project-assistant"
            title={assistantOpen ? "收起项目助手" : "展开项目助手"}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
              assistantOpen
                ? "border-line bg-surface text-ink-soft shadow-card hover:border-primary hover:text-primary"
                : "border-primary bg-primary-soft text-primary hover:bg-primary hover:text-white"
            }`}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{assistantOpen ? "收起助手" : "项目助手"}</span>
          </button>
        </div>

        {/* 三个面板保持挂载，切换标签不丢上传进度与评论草稿 */}
        <div
          role="tabpanel"
          id="panel-board"
          aria-labelledby="tab-board"
          hidden={tab !== "board"}
        >
          {board}
        </div>
        <div
          role="tabpanel"
          id="panel-files"
          aria-labelledby="tab-files"
          hidden={tab !== "files"}
        >
          {files}
        </div>
        <div
          role="tabpanel"
          id="panel-discussion"
          aria-labelledby="tab-discussion"
          hidden={tab !== "discussion"}
        >
          {discussion}
        </div>
      </div>

      {/* 收起时只隐藏、不卸载，对话与草案不会丢 */}
      <aside
        id="project-assistant"
        aria-label="项目助手"
        aria-hidden={!assistantOpen}
        className={`min-w-0 lg:sticky lg:top-24 ${
          assistantOpen ? "" : "hidden"
        }`}
      >
        {aside}
      </aside>
    </div>
  );
}
