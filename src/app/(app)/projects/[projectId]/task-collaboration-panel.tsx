"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AtSign,
  Bell,
  BellOff,
  MessageSquare,
  Paperclip,
  Pencil,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import {
  createTaskCommentAction,
  deleteTaskCommentAction,
  loadTaskCollaborationAction,
  setTaskWatchingAction,
  updateTaskCommentAction,
} from "./task-collaboration-actions";

type Member = { id: string; name: string };
type CommentView = {
  id: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  mentionIds: string[];
  attachments: { id: string; name: string; url: string }[];
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

async function readApiError(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return body?.error ?? "文件上传失败";
}

export function TaskCollaborationPanel({
  taskId,
  projectId,
  members,
  currentUserId,
  isAdmin,
}: {
  taskId: string;
  projectId: string;
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [comments, setComments] = useState<CommentView[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await loadTaskCollaborationAction(taskId);
    setComments(data.comments);
    setIsWatching(data.isWatching);
  }

  useEffect(() => {
    let cancelled = false;
    void loadTaskCollaborationAction(taskId)
      .then((data) => {
        if (cancelled) return;
        setComments(data.comments);
        setIsWatching(data.isWatching);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载评论失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function uploadFiles() {
    const ids: string[] = [];
    for (const file of files) {
      const created = await fetch(`/api/projects/${projectId}/file-uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || null,
          kind: "other",
        }),
      });
      if (!created.ok) throw new Error(await readApiError(created));
      const payload = (await created.json()) as { id: string };
      const uploaded = await fetch(`/api/project-files/${payload.id}/content`, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!uploaded.ok) throw new Error(await readApiError(uploaded));
      ids.push(payload.id);
    }
    return ids;
  }

  function submitComment() {
    const value = content.trim();
    if (!value || pending) return;
    setError("");
    startTransition(async () => {
      try {
        const projectFileIds = files.length > 0 ? await uploadFiles() : [];
        const result = await createTaskCommentAction({
          taskId,
          projectId,
          content: value,
          parentId: replyTo?.id,
          mentionIds,
          projectFileIds,
        });
        if (!result?.ok) {
          setError(result?.error ?? "评论失败");
          return;
        }
        setContent("");
        setReplyTo(null);
        setMentionIds([]);
        setFiles([]);
        await reload();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "评论失败");
      }
    });
  }

  const roots = comments.filter((comment) => !comment.parentId);

  return (
    <section className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
          任务评论
        </h3>
        <button
          type="button"
          onClick={() => {
            startTransition(async () => {
              const next = !isWatching;
              const result = await setTaskWatchingAction({
                taskId,
                projectId,
                watching: next,
              });
              if (result?.ok) setIsWatching(next);
              else if (result) setError(result.error);
            });
          }}
          className={`inline-flex items-center gap-1 text-xs ${
            isWatching ? "text-primary" : "text-ink-faint"
          }`}
        >
          {isWatching ? (
            <Bell className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <BellOff className="h-3.5 w-3.5" aria-hidden />
          )}
          {isWatching ? "已关注" : "关注任务"}
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {roots.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={comments.filter((reply) => reply.parentId === comment.id)}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            editingId={editingId}
            editingContent={editingContent}
            onStartEdit={(target) => {
              setEditingId(target.id);
              setEditingContent(target.content);
            }}
            onCancelEdit={() => setEditingId(null)}
            onChangeEdit={setEditingContent}
            onSaveEdit={() => {
              if (!editingId) return;
              startTransition(async () => {
                const result = await updateTaskCommentAction({
                  commentId: editingId,
                  projectId,
                  content: editingContent,
                });
                if (!result?.ok) {
                  setError(result?.error ?? "编辑失败");
                  return;
                }
                setEditingId(null);
                await reload();
              });
            }}
            onDelete={(commentId) => {
              if (!confirm("删除这条评论？")) return;
              startTransition(async () => {
                const result = await deleteTaskCommentAction({
                  commentId,
                  projectId,
                });
                if (!result?.ok) {
                  setError(result?.error ?? "删除失败");
                  return;
                }
                await reload();
              });
            }}
            onReply={(target) => setReplyTo(target)}
          />
        ))}
        {comments.length === 0 && (
          <p className="rounded-field bg-sunken/60 p-3 text-sm text-ink-faint">
            暂无评论，开始讨论这个任务。
          </p>
        )}
      </div>

      <div className="mt-4 rounded-field border border-line bg-sunken/40 p-3">
        {replyTo && (
          <p className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-soft">
            <span>回复 {replyTo.authorName ?? "已注销用户"}</span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="取消回复">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </p>
        )}
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={3}
          className="ac-field resize-y"
          placeholder="写下评论，可选择成员提及并添加附件"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(event) => {
              const id = event.target.value;
              const member = members.find((item) => item.id === id);
              if (!member) return;
              setMentionIds((current) =>
                current.includes(id) ? current : [...current, id],
              );
              setContent((current) => `${current}${current ? " " : ""}@${member.name} `);
            }}
            className="ac-field w-auto py-1 text-xs"
            aria-label="提及成员"
          >
            <option value="">@ 提及成员</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          {mentionIds.map((id) => {
            const member = members.find((item) => item.id === id);
            return (
              <span key={id} className="ac-badge bg-primary-soft text-primary">
                <AtSign className="h-3 w-3" aria-hidden />
                {member?.name ?? id}
                <button
                  type="button"
                  onClick={() => setMentionIds((current) => current.filter((item) => item !== id))}
                  aria-label={`取消提及 ${member?.name ?? id}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            );
          })}
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-ink-faint">
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            {files.length > 0 ? `${files.length} 个附件` : "添加附件"}
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          <button
            type="button"
            onClick={submitComment}
            disabled={pending || !content.trim()}
            className="ac-btn ml-auto"
          >
            {pending ? "提交中…" : replyTo ? "回复" : "发表评论"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-high">{error}</p>}
      </div>
    </section>
  );
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  isAdmin,
  editingId,
  editingContent,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onDelete,
  onReply,
}: {
  comment: CommentView;
  replies: CommentView[];
  currentUserId: string;
  isAdmin: boolean;
  editingId: string | null;
  editingContent: string;
  onStartEdit: (comment: CommentView) => void;
  onCancelEdit: () => void;
  onChangeEdit: (content: string) => void;
  onSaveEdit: () => void;
  onDelete: (commentId: string) => void;
  onReply: (comment: CommentView) => void;
}) {
  const canEdit = comment.authorId === currentUserId && !comment.deletedAt;
  const canDelete =
    !comment.deletedAt && (comment.authorId === currentUserId || isAdmin);
  return (
    <article className="rounded-field border border-line bg-surface p-3">
      <CommentBody
        comment={comment}
        canEdit={canEdit}
        canDelete={canDelete}
        editing={editingId === comment.id}
        editingContent={editingContent}
        onStartEdit={() => onStartEdit(comment)}
        onCancelEdit={onCancelEdit}
        onChangeEdit={onChangeEdit}
        onSaveEdit={onSaveEdit}
        onDelete={() => onDelete(comment.id)}
        onReply={() => onReply(comment)}
      />
      {replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
          {replies.map((reply) => (
            <CommentBody
              key={reply.id}
              comment={reply}
              canEdit={reply.authorId === currentUserId && !reply.deletedAt}
              canDelete={
                !reply.deletedAt &&
                (reply.authorId === currentUserId || isAdmin)
              }
              editing={editingId === reply.id}
              editingContent={editingContent}
              onStartEdit={() => onStartEdit(reply)}
              onCancelEdit={onCancelEdit}
              onChangeEdit={onChangeEdit}
              onSaveEdit={onSaveEdit}
              onDelete={() => onDelete(reply.id)}
              compact
            />
          ))}
        </div>
      )}
    </article>
  );
}

function CommentBody({
  comment,
  canEdit,
  canDelete,
  editing,
  editingContent,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onDelete,
  onReply,
  compact = false,
}: {
  comment: CommentView;
  canEdit: boolean;
  canDelete: boolean;
  editing: boolean;
  editingContent: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (content: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onReply?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">
            {comment.authorName ?? "已注销用户"}
          </span>
          <span className="text-xs text-ink-faint">
            {formatTime(comment.createdAt)}
            {comment.updatedAt !== comment.createdAt && !comment.deletedAt
              ? " · 已编辑"
              : ""}
          </span>
        </div>
        {!comment.deletedAt && (
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            {canEdit && (
              <button type="button" onClick={onStartEdit} aria-label="编辑评论">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={onDelete} aria-label="删除评论">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className="inline-flex items-center gap-1"
              >
                <Reply className="h-3.5 w-3.5" aria-hidden />
                回复
              </button>
            )}
          </div>
        )}
      </div>
      {comment.deletedAt ? (
        <p className="mt-1 text-xs italic text-ink-faint">评论已删除</p>
      ) : editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={editingContent}
            onChange={(event) => onChangeEdit(event.target.value)}
            rows={3}
            className="ac-field resize-y text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancelEdit} className="text-xs text-ink-faint">
              取消
            </button>
            <button type="button" onClick={onSaveEdit} className="ac-btn px-3 py-1 text-xs">
              保存
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-ink-soft">{comment.content}</p>
      )}
      {!comment.deletedAt && comment.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {comment.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
              {attachment.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
