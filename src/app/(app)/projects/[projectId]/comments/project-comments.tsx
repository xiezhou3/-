"use client";

import {
  ChevronUp,
  CornerDownRight,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";
import type {
  ProjectComment,
  ProjectCommentThread,
} from "@/lib/project-comment";
import {
  createCommentAction,
  deleteCommentAction,
  loadEarlierCommentsAction,
  updateCommentAction,
} from "./actions";

type Props = {
  projectId: string;
  initialThreads: ProjectCommentThread[];
  initialTotalCount: number;
  initialHasMore: boolean;
  initialCursor: { createdAt: string; id: string } | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  teacher: "导师",
  student: "成员",
};

export function ProjectComments({
  projectId,
  initialThreads,
  initialTotalCount,
  initialHasMore,
  initialCursor,
}: Props) {
  const [threads, setThreads] = useState(initialThreads);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState(initialCursor);
  const [rootText, setRootText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [error, setError] = useState("");
  const [loading, startTransition] = useTransition();

  function appendComment(comment: ProjectComment) {
    if (!comment.parentId) {
      setThreads((current) => [
        ...current,
        { comment, replies: [] },
      ]);
      setTotalCount((count) => count + 1);
      return;
    }
    setThreads((current) =>
      current.map((thread) =>
        thread.comment.id === comment.parentId
          ? { ...thread, replies: [...thread.replies, comment] }
          : thread,
      ),
    );
    setTotalCount((count) => count + 1);
  }

  function replaceComment(comment: ProjectComment) {
    setThreads((current) =>
      current.map((thread) => {
        if (thread.comment.id === comment.id) {
          return { ...thread, comment };
        }
        return {
          ...thread,
          replies: thread.replies.map((reply) =>
            reply.id === comment.id ? comment : reply,
          ),
        };
      }),
    );
  }

  function submitRoot() {
    const content = rootText.trim();
    if (!content || loading) return;
    setError("");
    startTransition(async () => {
      const result = await createCommentAction({
        projectId,
        content,
        parentId: null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRootText("");
      appendComment(result.comment);
    });
  }

  function submitReply(parentId: string) {
    const content = replyText.trim();
    if (!content || loading) return;
    setError("");
    startTransition(async () => {
      const result = await createCommentAction({
        projectId,
        content,
        parentId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReplyText("");
      setReplyTo(null);
      appendComment(result.comment);
    });
  }

  function saveEdit(commentId: string) {
    const content = editingText.trim();
    if (!content || loading) return;
    setError("");
    startTransition(async () => {
      const result = await updateCommentAction({
        projectId,
        commentId,
        content,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setEditingText("");
      replaceComment(result.comment);
    });
  }

  function removeComment(comment: ProjectComment, replyCount: number) {
    if (!window.confirm("确定删除这条评论吗？")) return;
    setError("");
    startTransition(async () => {
      const result = await deleteCommentAction({
        projectId,
        commentId: comment.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (comment.parentId) {
        setThreads((current) =>
          current.map((thread) => ({
            ...thread,
            replies: thread.replies.filter((reply) => reply.id !== comment.id),
          })),
        );
        setTotalCount((count) => Math.max(0, count - 1));
        return;
      }
      if (replyCount > 0) {
        setThreads((current) =>
          current.map((thread) =>
            thread.comment.id === comment.id
              ? {
                  ...thread,
                  comment: {
                    ...thread.comment,
                    content: "",
                    isDeleted: true,
                    canEdit: false,
                    canDelete: false,
                  },
                }
              : thread,
          ),
        );
        return;
      }
      setThreads((current) =>
        current.filter((thread) => thread.comment.id !== comment.id),
      );
      setTotalCount((count) => Math.max(0, count - 1));
    });
  }

  function loadEarlier() {
    if (!cursor || loading) return;
    setError("");
    startTransition(async () => {
      const result = await loadEarlierCommentsAction({
        projectId,
        beforeCreatedAt: cursor.createdAt,
        beforeId: cursor.id,
        limit: 20,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const existing = new Set(threads.map((thread) => thread.comment.id));
      setThreads((current) => [
        ...result.threads.filter(
          (thread) => !existing.has(thread.comment.id),
        ),
        ...current,
      ]);
      setTotalCount(result.totalCount);
      setHasMore(result.hasMore);
      setCursor(result.nextCursor);
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="font-display text-xl font-semibold text-ink">
              项目评论
            </h2>
            <span className="ac-badge bg-primary-soft text-primary">
              {totalCount}
            </span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-high">{error}</p>}

      {hasMore && (
        <button
          type="button"
          onClick={loadEarlier}
          disabled={loading}
          className="ac-btn-ghost"
        >
          <ChevronUp className="h-4 w-4" aria-hidden />
          {loading ? "加载中…" : "加载更早评论"}
        </button>
      )}

      <div className="space-y-3">
        {threads.length === 0 ? (
          <div className="ac-card p-8 text-center text-sm text-ink-soft">
            暂无评论。
          </div>
        ) : (
          threads.map((thread) => (
            <article key={thread.comment.id} className="ac-card space-y-3 p-4">
              <CommentCard
                comment={thread.comment}
                replyToName={null}
                editingId={editingId}
                editingText={editingText}
                disabled={loading}
                onEdit={(comment) => {
                  setEditingId(comment.id);
                  setEditingText(comment.content);
                }}
                onEditTextChange={setEditingText}
                onCancelEdit={() => {
                  setEditingId(null);
                  setEditingText("");
                }}
                onSaveEdit={saveEdit}
                onDelete={() => removeComment(thread.comment, thread.replies.length)}
                onReply={() => {
                  setReplyTo(thread.comment.id);
                  setReplyText("");
                }}
              />

              {thread.replies.length > 0 && (
                <div className="ml-5 space-y-3 border-l border-line pl-4 sm:ml-8">
                  {thread.replies.map((reply) => (
                    <CommentCard
                      key={reply.id}
                      comment={reply}
                      replyToName={thread.comment.authorName}
                      editingId={editingId}
                      editingText={editingText}
                      disabled={loading}
                      onEdit={(comment) => {
                        setEditingId(comment.id);
                        setEditingText(comment.content);
                      }}
                      onEditTextChange={setEditingText}
                      onCancelEdit={() => {
                        setEditingId(null);
                        setEditingText("");
                      }}
                      onSaveEdit={saveEdit}
                      onDelete={() => removeComment(reply, 0)}
                      onReply={null}
                    />
                  ))}
                </div>
              )}

              {!thread.comment.isDeleted && replyTo === thread.comment.id && (
                <div className="ml-5 space-y-2 border-l border-primary-ring pl-4 sm:ml-8">
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder={`回复 ${thread.comment.authorName}`}
                    className="ac-field"
                    disabled={loading}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="ac-btn-ghost"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => submitReply(thread.comment.id)}
                      disabled={loading || !replyText.trim()}
                      className="ac-btn"
                    >
                      <CornerDownRight className="h-4 w-4" aria-hidden />
                      回复
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <div className="ac-card space-y-3 p-4">
        <textarea
          value={rootText}
          onChange={(event) => setRootText(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="写下项目评论…"
          className="ac-field resize-y"
          disabled={loading}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-faint">
            {rootText.length}/2000
          </span>
          <button
            type="button"
            onClick={submitRoot}
            disabled={loading || !rootText.trim()}
            className="ac-btn"
          >
            <Send className="h-4 w-4" aria-hidden />
            {loading ? "发送中…" : "发表评论"}
          </button>
        </div>
      </div>
    </section>
  );
}

function CommentCard({
  comment,
  replyToName,
  editingId,
  editingText,
  disabled,
  onEdit,
  onEditTextChange,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onReply,
}: {
  comment: ProjectComment;
  replyToName: string | null;
  editingId: string | null;
  editingText: string;
  disabled: boolean;
  onEdit: (comment: ProjectComment) => void;
  onEditTextChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (commentId: string) => void;
  onDelete: () => void;
  onReply: (() => void) | null;
}) {
  const editing = editingId === comment.id;
  const initial = comment.authorName.slice(0, 1).toUpperCase();

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-sm font-semibold text-primary">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-medium text-ink">{comment.authorName}</span>
            {comment.authorRole && (
              <span className="ac-badge bg-sunken text-ink-soft">
                {ROLE_LABEL[comment.authorRole] ?? comment.authorRole}
              </span>
            )}
            {replyToName && (
              <span className="text-ink-faint">回复 {replyToName}</span>
            )}
            <time
              dateTime={comment.createdAt}
              title={formatCommentTime(comment.createdAt)}
              className="text-ink-faint"
            >
              <span className="hidden sm:inline">
                {formatCommentTime(comment.createdAt)}
              </span>
              <span className="sm:hidden">
                {formatCommentTimeCompact(comment.createdAt)}
              </span>
            </time>
            {comment.isEdited && <span className="text-ink-faint">已编辑</span>}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editingText}
                onChange={(event) => onEditTextChange(event.target.value)}
                rows={3}
                maxLength={2000}
                className="ac-field resize-y"
                disabled={disabled}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="ac-btn-ghost"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => onSaveEdit(comment.id)}
                  disabled={disabled || !editingText.trim()}
                  className="ac-btn"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`mt-1 whitespace-pre-wrap break-words text-sm ${
                comment.isDeleted ? "italic text-ink-faint" : "text-ink-soft"
              }`}
            >
              {comment.isDeleted ? "该评论已删除" : comment.content}
            </p>
          )}

          {!comment.isDeleted && !editing && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {onReply && (
                <button
                  type="button"
                  onClick={onReply}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
                  回复
                </button>
              )}
              {comment.canEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(comment)}
                  className="inline-flex items-center gap-1 text-ink-soft hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  编辑
                </button>
              )}
              {comment.canDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1 text-ink-soft hover:text-high"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  删除
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatCommentTimeCompact(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
