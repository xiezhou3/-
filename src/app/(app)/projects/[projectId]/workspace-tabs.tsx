"use client";

import { useState, type ReactNode } from "react";
import { FolderOpen, LayoutGrid, MessagesSquare } from "lucide-react";

type TabId = "board" | "files" | "discussion";

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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <div
          role="tablist"
          aria-label="项目工作区"
          className="flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-card"
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

      <aside aria-label="项目助手" className="min-w-0 lg:sticky lg:top-24">
        {aside}
      </aside>
    </div>
  );
}
