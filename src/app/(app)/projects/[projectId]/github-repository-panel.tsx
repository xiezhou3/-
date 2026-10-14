"use client";

import {
  CircleDot,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileUp,
  GitBranch,
  GitFork,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type { ProjectRepository } from "@/lib/project-repository-service";
import {
  connectGithubRepositoryAction,
  disconnectGithubRepositoryAction,
  syncGithubRepositoryAction,
  type GithubActionState,
} from "./github-actions";

type TreeFile = {
  path: string;
  size: number | null;
  sha: string;
};

type TreeResponse = {
  files: TreeFile[];
  truncated: boolean;
  total: number;
  error?: string;
};

export function GithubRepositoryPanel({
  projectId,
  repository,
  canManage,
}: {
  projectId: string;
  repository: ProjectRepository | null;
  canManage: boolean;
}) {
  const [branch, setBranch] = useState(repository?.defaultBranch ?? "main");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<TreeFile[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState("");
  const [treeNotes, setTreeNotes] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [folder, setFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState("");

  const [connectState, connectAction, connecting] = useActionState<
    GithubActionState,
    FormData
  >(connectGithubRepositoryAction, null);
  const [syncState, syncAction, syncing] = useActionState<
    GithubActionState,
    FormData
  >(syncGithubRepositoryAction, null);
  const [disconnectState, disconnectAction, disconnecting] = useActionState<
    GithubActionState,
    FormData
  >(disconnectGithubRepositoryAction, null);

  useEffect(() => {
    if (!repository) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ branch });
    async function loadTree() {
      setTreeLoading(true);
      setTreeError("");
      try {
        const response = await fetch(
          `/api/projects/${projectId}/github/tree?${params}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as TreeResponse;
        if (!response.ok) throw new Error(payload.error || "读取仓库失败");
        setFiles(payload.files);
        setTreeNotes(
          payload.truncated
            ? `仓库过大，当前仅展示前 ${payload.files.length} 个文件`
            : `共 ${payload.total} 个文件`,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTreeError(error instanceof Error ? error.message : "读取仓库失败");
      } finally {
        if (!controller.signal.aborted) setTreeLoading(false);
      }
    }
    void loadTree();
    return () => controller.abort();
  }, [projectId, repository, branch, refreshKey]);

  async function uploadFiles(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const selected = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (selected.length === 0) {
      setUploadMessage("请选择要上传的文件");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/github/files`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        uploaded?: { path: string }[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "上传失败");
      setUploadMessage(`已上传 ${payload.uploaded?.length ?? 0} 个文件`);
      form.reset();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function importFile(file: TreeFile) {
    setImportingPath(file.path);
    setImportMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/github/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path, branch }),
      });
      const payload = (await response.json()) as { error?: string; name?: string };
      if (!response.ok) throw new Error(payload.error || "提取失败");
      setImportMessage(`已提取到项目资料：${payload.name ?? file.path}`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "提取失败");
    } finally {
      setImportingPath(null);
    }
  }

  const queryLower = query.trim().toLocaleLowerCase();
  const visibleFiles = queryLower
    ? files.filter((file) => file.path.toLocaleLowerCase().includes(queryLower))
    : files;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-ink" aria-hidden />
            <h2 className="font-display text-xl font-semibold text-ink">
              GitHub 仓库
            </h2>
          </div>
          {repository && (
            <p className="mt-1 text-sm text-ink-soft">
              {repository.fullName}
              <span className="mx-1.5 text-ink-faint">·</span>
              {repository.defaultBranch}
            </p>
          )}
        </div>
        {repository?.canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <form action={syncAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <button disabled={syncing} className="ac-btn-ghost">
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
                同步
              </button>
            </form>
            <form
              action={disconnectAction}
              onSubmit={(event) => {
                if (!window.confirm("确定断开当前 GitHub 仓库吗？")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="projectId" value={projectId} />
              <button disabled={disconnecting} className="ac-btn-ghost text-high">
                <Trash2 className="h-4 w-4" aria-hidden />
                断开
              </button>
            </form>
          </div>
        )}
      </div>

      {(connectState && "error" in connectState) ||
      (syncState && "error" in syncState) ||
      (disconnectState && "error" in disconnectState) ? (
        <p className="text-sm text-high">
          {getActionError(connectState) ??
            getActionError(syncState) ??
            getActionError(disconnectState)}
        </p>
      ) : null}

      {!repository ? (
        <div className="ac-card space-y-4 p-5">
          {canManage ? (
            <form action={connectAction} className="space-y-3">
              <input type="hidden" name="projectId" value={projectId} />
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-ink-soft">仓库地址</span>
                <input
                  name="repositoryUrl"
                  placeholder="https://github.com/owner/repository"
                  className="ac-field"
                  required
                />
              </label>
              <button disabled={connecting} className="ac-btn">
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Link2 className="h-4 w-4" aria-hidden />
                )}
                连接仓库
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink-soft">尚未连接 GitHub 仓库。</p>
          )}
        </div>
      ) : (
        <div className="ac-card overflow-hidden">
          <div className="border-b border-line p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <a
                  href={repository.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 font-medium text-ink hover:text-primary"
                >
                  {repository.fullName}
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
                {repository.description && (
                  <p className="mt-1 max-w-2xl text-sm text-ink-soft">
                    {repository.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" aria-hidden />
                    {repository.stars}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <GitFork className="h-3.5 w-3.5" aria-hidden />
                    {repository.forks}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CircleDot className="h-3.5 w-3.5" aria-hidden />
                    {repository.openIssues}
                  </span>
                  {repository.language && <span>{repository.language}</span>}
                  <span>{repository.visibility ?? "public"}</span>
                </div>
              </div>
            </div>
            {repository.latestCommitMessage && (
              <a
                href={repository.latestCommitUrl ?? repository.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex items-start gap-2 rounded-field border border-line bg-sunken px-3 py-2 text-xs text-ink-soft hover:border-primary hover:text-primary"
              >
                <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="line-clamp-2">
                  {repository.latestCommitMessage}
                  {repository.latestCommitSha && (
                    <span className="ml-2 font-mono text-ink-faint">
                      {repository.latestCommitSha.slice(0, 7)}
                    </span>
                  )}
                </span>
              </a>
            )}
          </div>

          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                    aria-hidden
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索仓库文件"
                    className="ac-field pl-9"
                  />
                </label>
                <label className="flex min-w-0 items-center gap-2 sm:w-52">
                  <GitBranch className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  <input
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                    className="ac-field min-w-0"
                    aria-label="分支"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  className="ac-btn-ghost"
                  aria-label="刷新仓库文件"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {treeError && <p className="text-sm text-high">{treeError}</p>}
              {treeNotes && !treeError && (
                <p className="text-xs text-ink-faint">{treeNotes}</p>
              )}
              {importMessage && (
                <p className="text-xs text-done">{importMessage}</p>
              )}

              <div className="max-h-96 overflow-y-auto rounded-field border border-line">
                {treeLoading ? (
                  <div className="grid h-32 place-items-center text-sm text-ink-soft">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  </div>
                ) : visibleFiles.length === 0 ? (
                  <div className="grid h-32 place-items-center text-sm text-ink-soft">
                    没有匹配的仓库文件
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {visibleFiles.map((file) => {
                      const params = new URLSearchParams({
                        path: file.path,
                        branch,
                        download: "1",
                      });
                      return (
                        <li
                          key={file.sha}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm"
                        >
                          <FileCode2
                            className="h-4 w-4 shrink-0 text-ink-faint"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                            {file.path}
                          </span>
                          <span className="hidden shrink-0 text-xs text-ink-faint sm:inline">
                            {formatBytes(file.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void importFile(file)}
                            disabled={importingPath === file.path}
                            className="shrink-0 text-xs text-primary hover:underline disabled:opacity-50"
                          >
                            {importingPath === file.path ? "提取中" : "提取"}
                          </button>
                          <a
                            href={`/api/projects/${projectId}/github/file?${params}`}
                            className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-soft hover:text-primary"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            下载
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <form
              onSubmit={uploadFiles}
              className="space-y-3 rounded-field border border-line bg-sunken p-4"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <FileUp className="h-4 w-4 text-primary" aria-hidden />
                上传到仓库
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs text-ink-soft">目标目录</span>
                <input
                  name="folder"
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                  placeholder="例如 docs"
                  className="ac-field"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-ink-soft">提交说明</span>
                <input
                  name="message"
                  defaultValue="Upload files from AgileCampus"
                  className="ac-field"
                />
              </label>
              <input type="hidden" name="branch" value={branch} />
              <label className="block">
                <span className="text-xs text-ink-soft">选择文件（单个不超过 20 MB）</span>
                <input
                  name="files"
                  type="file"
                  multiple
                  className="mt-1.5 block w-full text-xs text-ink-soft file:mr-2 file:rounded-field file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
                />
              </label>
              {uploadMessage && (
                <p className="text-xs text-ink-soft">{uploadMessage}</p>
              )}
              <button disabled={uploading} className="ac-btn w-full">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FileUp className="h-4 w-4" aria-hidden />
                )}
                {uploading ? "上传中…" : "上传文件"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function getActionError(state: GithubActionState) {
  return state && "error" in state ? state.error : null;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
