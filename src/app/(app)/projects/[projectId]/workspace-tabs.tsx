"use client";

import { useState, type ReactNode } from "react";
import {
  FolderOpen,
  KanbanSquare,
  MessagesSquare,
  Sparkles,
  X,
} from "lucide-react";

type TabId = "board" | "files" | "discussion";

export function ProjectWorkspaceTabs({
  board,
  files,
  discussion,
  assistant,
  boardCount,
  fileCount,
  discussionCount,
}: {
  board: ReactNode;
  files: ReactNode;
  discussion: ReactNode;
  assistant: ReactNode;
  boardCount: number;
  fileCount: number;
  discussionCount: number;
}) {
  const [tab, setTab] = useState<TabId>("board");
  const [assistantOpen, setAssistantOpen] = useState(false);

  const tabs = [
    {
      id: "board" as const,
      label: "项目看板",
      icon: KanbanSquare,
      count: boardCount,
    },
    {
      id: "files" as const,
      label: "资料与仓库",
      icon: FolderOpen,
      count: fileCount,
    },
    {
      id: "discussion" as const,
      label: "项目讨论",
      icon: MessagesSquare,
      count: discussionCount,
    },
  ];

  return (
    <div
      className={`grid items-start gap-5 ${
        assistantOpen
          ? "xl:grid-cols-[minmax(0,1fr)_22rem]"
          : "grid-cols-1"
      }`}
    >
      <div className="min-w-0 space-y-4">
        <div className="ac-panel flex items-center gap-2 p-1.5">
          <div
            role="tablist"
            aria-label="项目工作区"
            className="ac-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto"
          >
            {tabs.map(({ id, label, icon: Icon, count }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`project-tab-${id}`}
                  aria-selected={active}
                  aria-controls={`project-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-field px-3 py-2 text-sm transition-colors sm:flex-1 ${
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "text-ink-soft hover:bg-primary-soft hover:text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="sm:hidden">
                    {id === "board" ? "看板" : id === "files" ? "资料" : "讨论"}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active
                        ? "bg-white/18 text-white"
                        : "bg-sunken text-ink-faint"
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
            onClick={() => setAssistantOpen((open) => !open)}
            aria-expanded={assistantOpen}
            aria-controls="project-assistant"
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-field border px-2.5 text-xs font-medium transition-colors ${
              assistantOpen
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-surface text-ink-soft hover:border-primary-ring hover:text-primary"
            }`}
            title={assistantOpen ? "收起项目助手" : "打开项目助手"}
          >
            {assistantOpen ? (
              <X className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="hidden sm:inline">
              {assistantOpen ? "收起助手" : "项目助手"}
            </span>
          </button>
        </div>

        <div
          role="tabpanel"
          id="project-panel-board"
          aria-labelledby="project-tab-board"
          hidden={tab !== "board"}
        >
          {board}
        </div>
        <div
          role="tabpanel"
          id="project-panel-files"
          aria-labelledby="project-tab-files"
          hidden={tab !== "files"}
        >
          {files}
        </div>
        <div
          role="tabpanel"
          id="project-panel-discussion"
          aria-labelledby="project-tab-discussion"
          hidden={tab !== "discussion"}
        >
          {discussion}
        </div>
      </div>

      <aside
        id="project-assistant"
        aria-label="项目助手"
        className={`min-w-0 xl:sticky xl:top-24 ${
          assistantOpen ? "" : "hidden"
        }`}
      >
        {assistant}
      </aside>
    </div>
  );
}
