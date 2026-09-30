"use client";

import Link from "next/link";
import {
  Archive,
  AudioLines,
  ChevronRight,
  Clock,
  Code2,
  Download,
  Eye,
  ExternalLink,
  FileText,
  FolderTree,
  GitBranch,
  HardDrive,
  Link2,
  Play,
  Presentation,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserRound,
  Video,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { nanoid } from "nanoid";
import {
  filterProjectFiles,
  formatFileDuration,
  formatFileSize,
  formatProjectFileTime,
  PROJECT_FILE_KIND_LABEL,
  resolveProjectFileKind,
  sortProjectFiles,
  summarizeProjectFiles,
  type ProjectFile,
  type ProjectFileKind,
  type ProjectFileSort,
  type StoredProjectFile,
} from "@/lib/project-files";

type ProjectFilesLibraryProps = {
  projectId: string;
  projectName: string;
  files: StoredProjectFile[];
  variant: "compact" | "full";
  viewAllHref?: string;
};

type UploadItem = {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  kind: ProjectFileKind;
  progress: number;
  recordId?: string;
  status: "uploading" | "failed";
  error?: string;
};

const KIND_FILTERS: Array<{ value: ProjectFileKind | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "presentation", label: "PPT" },
  { value: "document", label: "文档" },
  { value: "code", label: "代码" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "other", label: "其他" },
];

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "请求失败";
  } catch {
    return "请求失败";
  }
}

function readXhrError(request: XMLHttpRequest) {
  try {
    const data = JSON.parse(request.responseText) as { error?: string };
    return data.error || "上传失败";
  } catch {
    return request.responseText;
  }
}

export function ProjectFilesLibrary({
  projectId,
  projectName,
  files: initialFiles,
  variant,
  viewAllHref,
}: ProjectFilesLibraryProps) {
  const [files, setFiles] = useState(initialFiles);
  const [kind, setKind] = useState<ProjectFileKind | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectFileSort>("updated");
  const [selectedFile, setSelectedFile] = useState<StoredProjectFile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"upload" | "link">("upload");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKind, setLinkKind] = useState<ProjectFileKind>("video");
  const [uploadKind, setUploadKind] = useState<ProjectFileKind | "auto">("auto");
  const [linkError, setLinkError] = useState("");
  const [dragging, setDragging] = useState(false);
  const uploadRequests = useRef(new Map<string, XMLHttpRequest>());
  const cancelledUploads = useRef(new Set<string>());

  useEffect(() => {
    const requests = uploadRequests;
    return () => {
      requests.current.forEach((request) => request.abort());
    };
  }, []);

  useEffect(() => {
    if (!selectedFile) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedFile(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedFile]);

  const summary = summarizeProjectFiles(files);
  const filtered = sortProjectFiles(
    filterProjectFiles(files, { query, kind }),
    sort,
  );
  const visibleFiles =
    variant === "compact"
      ? sortProjectFiles(files, "updated").slice(0, 4)
      : filtered;

  function addLocalFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;
    const nextUploads = selectedFiles.map((file) => {
      const kind = resolveProjectFileKind(file.name, file.type, uploadKind);
      return {
        id: nanoid(),
        file,
        name: file.name,
        sizeBytes: file.size,
        kind,
        progress: 0,
        status: "uploading" as const,
      } satisfies UploadItem;
    });
    setUploads((current) => [...nextUploads, ...current]);
    nextUploads.forEach(startUpload);
  }

  async function refreshFiles() {
    const response = await fetch(`/api/projects/${projectId}/files`);
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    const data = (await response.json()) as { files: StoredProjectFile[] };
    setFiles(data.files);
  }

  async function startUpload(upload: UploadItem) {
    cancelledUploads.current.delete(upload.id);
    setUploads((current) =>
      current.map((item) =>
        item.id === upload.id
          ? { ...item, status: "uploading", progress: 0, error: undefined }
          : item,
      ),
    );

    try {
      let recordId = upload.recordId;
      if (!recordId) {
        const created = await fetch(
          `/api/projects/${projectId}/file-uploads`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: upload.name,
              sizeBytes: upload.sizeBytes,
              mimeType: upload.file.type || null,
              kind: upload.kind,
            }),
          },
        );
        if (!created.ok) throw new Error(await readApiError(created));
        const payload = (await created.json()) as { id: string };
        recordId = payload.id;
        setUploads((current) =>
          current.map((item) =>
            item.id === upload.id ? { ...item, recordId } : item,
          ),
        );
      }
      if (cancelledUploads.current.has(upload.id)) {
        await fetch(`/api/project-files/${recordId}`, { method: "DELETE" });
        return;
      }

      await putUploadContent(recordId, upload.id, upload.file, (progress) => {
        setUploads((current) =>
          current.map((item) =>
            item.id === upload.id ? { ...item, progress } : item,
          ),
        );
      });
      setUploads((current) => current.filter((item) => item.id !== upload.id));
      await refreshFiles();
    } catch (error) {
      if (cancelledUploads.current.has(upload.id)) return;
      setUploads((current) =>
        current.map((item) =>
          item.id === upload.id
            ? {
                ...item,
                status: "failed",
                error: error instanceof Error ? error.message : "上传失败",
              }
            : item,
        ),
      );
    }
  }

  function putUploadContent(
    recordId: string,
    uploadId: string,
    file: File,
    onProgress: (progress: number) => void,
  ) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      uploadRequests.current.set(uploadId, request);
      request.open("PUT", `/api/project-files/${recordId}/content`);
      request.setRequestHeader(
        "Content-Type",
        file.type || "application/octet-stream",
      );
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        uploadRequests.current.delete(uploadId);
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve();
          return;
        }
        reject(new Error(readXhrError(request) || "上传失败"));
      };
      request.onerror = () => {
        uploadRequests.current.delete(uploadId);
        reject(new Error("网络错误，上传失败"));
      };
      request.onabort = () => {
        uploadRequests.current.delete(uploadId);
        reject(new Error("上传已取消"));
      };
      request.send(file);
    });
  }

  function retryUpload(uploadId: string) {
    const upload = uploads.find((item) => item.id === uploadId);
    if (upload) void startUpload(upload);
  }

  function cancelUpload(uploadId: string) {
    const upload = uploads.find((item) => item.id === uploadId);
    cancelledUploads.current.add(uploadId);
    uploadRequests.current.get(uploadId)?.abort();
    uploadRequests.current.delete(uploadId);
    setUploads((current) => current.filter((item) => item.id !== uploadId));
    if (upload?.recordId) {
      void fetch(`/api/project-files/${upload.recordId}`, {
        method: "DELETE",
      });
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    addLocalFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    addLocalFiles(Array.from(event.dataTransfer.files));
  }

  async function addLink() {
    const name = linkName.trim();
    if (!name) {
      setLinkError("请填写文件名称");
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/file-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url: linkUrl.trim(), kind: linkKind }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      await refreshFiles();
      setLinkName("");
      setLinkUrl("");
      setLinkKind("video");
      setLinkError("");
      setDialogOpen(false);
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "添加链接失败");
    }
  }

  function closeDialog() {
    if (uploads.some((upload) => upload.status === "uploading")) return;
    setUploads((current) =>
      current.filter((upload) => upload.status === "uploading"),
    );
    setDialogOpen(false);
    setLinkError("");
  }

  async function deleteFile(file: StoredProjectFile) {
    if (!window.confirm(`确定删除“${file.name}”吗？`)) return;
    const response = await fetch(`/api/project-files/${file.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert(await readApiError(response));
      return;
    }
    setSelectedFile(null);
    await refreshFiles();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-ink">
              {variant === "compact" ? "项目资料" : "全部文件"}
            </h2>
            <span className="ac-badge bg-primary-soft text-primary">
              {summary.total}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            PPT {summary.presentation} · 代码 {summary.code} · 视频 {summary.video} · 音频{" "}
            {summary.audio}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDialogTab("upload");
              setDialogOpen(true);
            }}
            className="ac-btn"
          >
            <Upload className="h-4 w-4" aria-hidden />
            添加文件
          </button>
          {variant === "compact" && viewAllHref && (
            <Link href={viewAllHref} className="ac-btn-ghost">
              查看全部
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {variant === "full" && (
        <div className="ac-card space-y-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索文件名或上传者"
                className="ac-field pl-9"
              />
            </label>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ProjectFileSort)}
              className="ac-field w-full lg:w-40"
              aria-label="文件排序"
            >
              <option value="updated">最近更新</option>
              <option value="name">按名称</option>
              <option value="size">按大小</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {KIND_FILTERS.map((item) => {
              const count = filterProjectFiles(files, { kind: item.value }).length;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setKind(item.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    kind === item.value
                      ? "border-primary bg-primary text-white"
                      : "border-line-strong bg-surface text-ink-soft hover:border-primary hover:text-primary"
                  }`}
                >
                  {item.label} {count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {visibleFiles.length === 0 ? (
        <div className="ac-card p-10 text-center text-sm text-ink-soft">
          没有符合当前条件的文件。
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            variant === "compact"
              ? "sm:grid-cols-2 xl:grid-cols-4"
              : "sm:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {visibleFiles.map((file) => (
            <ProjectFileCard
              key={file.id}
              file={file}
              compact={variant === "compact"}
              onOpen={() => setSelectedFile(file)}
            />
          ))}
        </div>
      )}

      {selectedFile && (
        <FilePreviewDrawer
          projectId={projectId}
          projectName={projectName}
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onDelete={() => void deleteFile(selectedFile)}
        />
      )}

      {dialogOpen && (
        <AddFileDialog
          tab={dialogTab}
          onTabChange={setDialogTab}
          uploads={uploads}
          dragging={dragging}
          onDraggingChange={setDragging}
          onFileInput={onFileInput}
          onDrop={onDrop}
          linkName={linkName}
          linkUrl={linkUrl}
          linkKind={linkKind}
          uploadKind={uploadKind}
          linkError={linkError}
          onLinkNameChange={setLinkName}
          onLinkUrlChange={setLinkUrl}
          onLinkKindChange={setLinkKind}
          onUploadKindChange={setUploadKind}
          onCancelUpload={cancelUpload}
          onRetryUpload={retryUpload}
          onAddLink={addLink}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}

function ProjectFileCard({
  file,
  compact,
  onOpen,
}: {
  file: ProjectFile;
  compact: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="ac-card group overflow-hidden text-left transition-transform hover:-translate-y-0.5 hover:shadow-pop"
      aria-label={`预览 ${file.name}`}
    >
      <FilePreviewVisual file={file} compact={compact} />
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium text-ink">{file.name}</span>
          <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
            {PROJECT_FILE_KIND_LABEL[file.kind]}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-ink-faint">
          <span className="truncate">
            {file.owner} · {formatProjectFileTime(file.updatedAt)}
          </span>
          <span className="shrink-0">
            {file.kind === "code" && file.source === "link"
              ? "代码仓库"
              : formatFileDuration(file.durationSeconds) ??
                formatFileSize(file.sizeBytes)}
          </span>
        </div>
      </div>
    </button>
  );
}

function FilePreviewVisual({
  file,
  compact,
}: {
  file: ProjectFile;
  compact: boolean;
}) {
  const duration = formatFileDuration(file.durationSeconds);
  const height = compact ? "h-32" : "h-40";

  if (file.kind === "code") {
    const repository = file.source === "link";
    return (
      <div className={`relative ${height} overflow-hidden border-b border-line bg-[#edf1f5] p-4`}>
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-white/90 px-2 py-0.5 text-[10px] font-medium text-primary">
          {repository ? (
            <GitBranch className="h-3 w-3" aria-hidden />
          ) : (
            <Archive className="h-3 w-3" aria-hidden />
          )}
          {repository ? "仓库" : "压缩包"}
        </span>
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-field bg-primary text-white">
            {repository ? (
              <GitBranch className="h-4 w-4" aria-hidden />
            ) : (
              <Code2 className="h-4 w-4" aria-hidden />
            )}
          </span>
          <span className="text-xs font-semibold text-ink">
            {file.codeMeta?.primaryLanguage ?? "Source Code"}
          </span>
        </div>
        <div className="mt-3 space-y-1.5 font-mono text-[10px] text-ink-soft">
          {["src/", "public/", "package.json", "README.md"].map((item) => (
            <div key={item} className="flex items-center gap-1.5">
              <FolderTree className="h-3 w-3 text-primary" aria-hidden />
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (file.kind === "presentation") {
    return (
      <div className={`relative ${height} overflow-hidden border-b border-line bg-[#f3eee3] p-4`}>
        <div className="flex h-full flex-col rounded-md border border-[#ded4c3] bg-white p-3 shadow-sm">
          <div className="h-2 w-1/3 rounded-full bg-[#bf6a34]" />
          <div className="mt-3 h-2 w-4/5 rounded-full bg-[#d8d1c2]" />
          <div className="mt-2 h-2 w-3/5 rounded-full bg-[#e8e3d8]" />
          <div className="mt-auto grid grid-cols-3 gap-2">
            <span className="h-7 rounded bg-primary-soft" />
            <span className="h-7 rounded bg-accent-soft" />
            <span className="h-7 rounded bg-sunken" />
          </div>
        </div>
      </div>
    );
  }

  if (file.kind === "video") {
    return (
      <div className={`relative ${height} overflow-hidden border-b border-line bg-[#222b36]`}>
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.04)_0_35%,rgba(255,255,255,0.01)_35%_100%)]" />
        <span className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-primary shadow-pop">
          <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
        </span>
        {duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">
            {duration}
          </span>
        )}
        {file.source === "link" && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-white/90 px-2 py-0.5 text-[10px] text-primary">
            <Link2 className="h-3 w-3" aria-hidden />
            链接
          </span>
        )}
      </div>
    );
  }

  if (file.kind === "audio") {
    return (
      <div className={`${height} flex items-center gap-3 border-b border-line bg-[#edf3f8] px-4`}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white">
          <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden />
        </span>
        <Waveform seed={file.id} />
        {duration && (
          <span className="text-[10px] tabular-nums text-ink-soft">{duration}</span>
        )}
      </div>
    );
  }

  if (file.kind === "document") {
    return (
      <div className={`${height} grid place-items-center border-b border-line bg-[#f1f5f8]`}>
        <FileText className="h-12 w-12 text-primary" strokeWidth={1.4} aria-hidden />
      </div>
    );
  }

  return (
    <div className={`${height} grid place-items-center border-b border-line bg-sunken`}>
      <Archive className="h-12 w-12 text-ink-faint" strokeWidth={1.4} aria-hidden />
    </div>
  );
}

function Waveform({ seed }: { seed: string }) {
  const bars = Array.from({ length: 18 }, (_, index) => {
    const charCode = seed.charCodeAt(index % seed.length);
    return 22 + ((charCode + index * 13) % 70);
  });
  return (
    <div className="flex h-12 min-w-0 flex-1 items-center gap-1" aria-hidden>
      {bars.map((height, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-primary/65"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function FilePreviewDrawer({
  projectId,
  projectName,
  file,
  onClose,
  onDelete,
}: {
  projectId: string;
  projectName: string;
  file: StoredProjectFile;
  onClose: () => void;
  onDelete: () => void;
}) {
  const Icon =
    file.kind === "presentation"
      ? Presentation
      : file.kind === "code"
        ? Code2
      : file.kind === "video"
        ? Video
        : file.kind === "audio"
          ? AudioLines
          : file.kind === "document"
            ? FileText
            : Archive;
  const titleHref =
    file.source === "upload"
      ? `/projects/${projectId}/files/${file.id}/view`
      : file.url;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭文件预览"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${file.name} 预览`}
        className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-line bg-surface shadow-pop"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <p className="text-xs text-ink-faint">{projectName}</p>
            {titleHref ? (
              <a
                href={titleHref}
                target="_blank"
                rel="noreferrer"
                className="group mt-1 inline-flex items-start gap-2 break-words font-display text-xl font-semibold text-ink hover:text-primary"
                aria-label={`在新标签页打开 ${file.name}`}
              >
                <span className="break-words">{file.name}</span>
                <ExternalLink
                  className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-primary"
                  aria-hidden
                />
              </a>
            ) : (
              <h2 className="mt-1 break-words font-display text-xl font-semibold text-ink">
                {file.name}
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-field text-ink-soft hover:bg-sunken"
            aria-label="关闭"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <DrawerPreview file={file} />
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
            <MetaItem icon={Icon} label="类型" value={PROJECT_FILE_KIND_LABEL[file.kind]} />
            {file.codeMeta?.primaryLanguage && (
              <MetaItem
                icon={Code2}
                label="主要语言"
                value={file.codeMeta.primaryLanguage}
              />
            )}
            <MetaItem
              icon={HardDrive}
              label="大小"
              value={formatFileSize(file.sizeBytes)}
            />
            <MetaItem icon={UserRound} label="上传者" value={file.owner} />
            <MetaItem
              icon={Clock}
              label="更新时间"
              value={formatProjectFileTime(file.updatedAt)}
            />
            {file.codeMeta?.fileCount !== undefined && (
              <MetaItem
                icon={FolderTree}
                label="代码文件"
                value={`${file.codeMeta.fileCount} 个`}
              />
            )}
          </dl>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line p-5">
          {file.canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="ac-btn-ghost mr-auto text-high"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              删除
            </button>
          )}
          {file.source === "link" && file.url && (
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="ac-btn-ghost"
            >
              <Eye className="h-4 w-4" aria-hidden />
              {file.kind === "code" ? "打开仓库" : "打开链接"}
            </a>
          )}
          {file.source === "upload" && file.url && (
            <a
              href={`${file.url}?download=1`}
              className="ac-btn"
              download={file.name}
            >
              <Download className="h-4 w-4" aria-hidden />
              下载文件
            </a>
          )}
        </footer>
      </aside>
    </div>
  );
}

function DrawerPreview({ file }: { file: ProjectFile }) {
  if (file.kind === "code") {
    const repository = file.source === "link";
    const directories = file.codeMeta?.directories ?? [
      "src/",
      "public/",
      "package.json",
      "README.md",
    ];
    return (
      <div className="space-y-4">
        <div className="rounded-card border border-line bg-[#edf1f5] p-5">
          <div className="flex items-center justify-between gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-field bg-primary text-white">
              {repository ? (
                <GitBranch className="h-5 w-5" aria-hidden />
              ) : (
                <Code2 className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {repository ? "Git 代码仓库" : "源码归档包"}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {file.codeMeta?.primaryLanguage ?? "Source Code"}
                {file.codeMeta?.fileCount !== undefined
                  ? ` · ${file.codeMeta.fileCount} 个文件`
                  : ""}
              </p>
            </div>
            {file.codeMeta?.hasReadme && (
              <span className="ac-badge bg-done/12 text-done">README</span>
            )}
          </div>
          <div className="mt-5 rounded-field border border-line bg-white p-4 font-mono text-xs text-ink-soft">
            <div className="flex items-center gap-2 font-semibold text-ink">
              <FolderTree className="h-4 w-4 text-primary" aria-hidden />
              project-root/
            </div>
            <div className="mt-3 space-y-2 border-l border-line pl-4">
              {directories.map((directory) => (
                <div key={directory} className="flex items-center gap-2">
                  {directory.endsWith("/") ? (
                    <FolderTree className="h-3.5 w-3.5 text-accent" aria-hidden />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
                  )}
                  {directory}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-card border border-line bg-[#1f2732] p-4 font-mono text-xs text-[#d7dde5]">
          <p className="text-[#8fb6e8]"># {file.name}</p>
          <p className="mt-3">项目源码与文档已归档。</p>
          <p className="mt-2 text-[#95a1af]">- 安装依赖</p>
          <p className="text-[#95a1af]">- 启动开发环境</p>
          <p className="text-[#95a1af]">- 构建并部署</p>
        </div>
      </div>
    );
  }

  if (file.kind === "video") {
    return file.url ? (
      <video src={file.url} controls className="aspect-video w-full rounded-card bg-black" />
    ) : (
      <div className="aspect-video grid place-items-center rounded-card bg-[#222b36] text-white">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-primary">
          <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
        </span>
      </div>
    );
  }

  if (file.kind === "audio") {
    return (
      <div className="rounded-card border border-line bg-[#edf3f8] p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-white">
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
          </span>
          <Waveform seed={file.id} />
        </div>
        {file.url && (
          <audio src={file.url} controls className="mt-4 w-full" />
        )}
      </div>
    );
  }

  if (file.kind === "presentation") {
    return (
      <div className="rounded-card border border-line bg-[#f3eee3] p-6">
        <div className="mx-auto flex aspect-video max-w-sm flex-col rounded-md border border-[#ded4c3] bg-white p-6 shadow-card">
          <div className="h-3 w-1/3 rounded-full bg-accent" />
          <div className="mt-6 h-3 w-4/5 rounded-full bg-line-strong" />
          <div className="mt-3 h-3 w-3/5 rounded-full bg-line" />
          <div className="mt-auto grid grid-cols-3 gap-3">
            <span className="h-16 rounded bg-primary-soft" />
            <span className="h-16 rounded bg-accent-soft" />
            <span className="h-16 rounded bg-sunken" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid aspect-video place-items-center rounded-card border border-line bg-sunken">
      {file.kind === "document" ? (
        <FileText className="h-20 w-20 text-primary" strokeWidth={1.2} aria-hidden />
      ) : (
        <Archive className="h-20 w-20 text-ink-faint" strokeWidth={1.2} aria-hidden />
      )}
    </div>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-ink-soft">{value}</dd>
    </div>
  );
}

function AddFileDialog({
  tab,
  onTabChange,
  uploads,
  dragging,
  onDraggingChange,
  onFileInput,
  onDrop,
  linkName,
  linkUrl,
  linkKind,
  uploadKind,
  linkError,
  onLinkNameChange,
  onLinkUrlChange,
  onLinkKindChange,
  onUploadKindChange,
  onCancelUpload,
  onRetryUpload,
  onAddLink,
  onClose,
}: {
  tab: "upload" | "link";
  onTabChange: (tab: "upload" | "link") => void;
  uploads: UploadItem[];
  dragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  linkName: string;
  linkUrl: string;
  linkKind: ProjectFileKind;
  uploadKind: ProjectFileKind | "auto";
  linkError: string;
  onLinkNameChange: (value: string) => void;
  onLinkUrlChange: (value: string) => void;
  onLinkKindChange: (value: ProjectFileKind) => void;
  onUploadKindChange: (value: ProjectFileKind | "auto") => void;
  onCancelUpload: (uploadId: string) => void;
  onRetryUpload: (uploadId: string) => void;
  onAddLink: () => void;
  onClose: () => void;
}) {
  const uploading = uploads.some((upload) => upload.status === "uploading");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="关闭添加文件"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="添加文件"
        className="relative z-10 w-full max-w-xl rounded-card border border-line bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">添加文件</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="grid h-9 w-9 place-items-center rounded-field text-ink-soft hover:bg-sunken disabled:opacity-40"
            aria-label="关闭"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-5 flex gap-1 rounded-field bg-sunken p-1">
          {[
            { value: "upload" as const, label: "上传文件" },
            { value: "link" as const, label: "添加链接" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onTabChange(item.value)}
              disabled={uploading}
              className={`flex-1 rounded-[6px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                tab === item.value
                  ? "bg-surface text-primary shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "upload" ? (
          <div className="mt-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-soft">上传到分类</span>
              <select
                value={uploadKind}
                onChange={(event) =>
                  onUploadKindChange(
                    event.target.value as ProjectFileKind | "auto",
                  )
                }
                className="ac-field"
                disabled={uploading}
              >
                <option value="auto">自动识别</option>
                <option value="code">代码 / 源码压缩包</option>
                <option value="presentation">PPT / 演示</option>
                <option value="document">文档</option>
                <option value="video">视频</option>
                <option value="audio">音频</option>
                <option value="other">其他资料</option>
              </select>
            </label>
            <label
              onDragOver={(event) => {
                event.preventDefault();
                onDraggingChange(true);
              }}
              onDragLeave={() => onDraggingChange(false)}
              onDrop={onDrop}
              className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-card border border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-primary bg-primary-soft"
                  : "border-line-strong bg-sunken/60 hover:border-primary"
              }`}
            >
              <Upload className="h-8 w-8 text-primary" aria-hidden />
              <span className="mt-3 text-sm font-medium text-ink">
                拖拽文件到这里，或点击选择
              </span>
              <span className="mt-1 text-xs text-ink-faint">
                支持源码、压缩包、PPT、文档、视频和音频
              </span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={onFileInput}
                accept=".ts,.tsx,.js,.jsx,.html,.css,.scss,.vue,.svelte,.py,.java,.go,.rs,.sql,.json,.yml,.yaml,.toml,.sh,.ps1,.ppt,.pptx,.key,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.mp4,.mov,.webm,.mp3,.wav,.m4a,.zip,.tar.gz,.tgz,.rar,.7z"
              />
            </label>
            {uploads.length > 0 && (
              <ul className="space-y-2">
                {uploads.map((upload) => (
                  <li key={upload.id} className="rounded-field border border-line p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-ink-soft">{upload.name}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-ink-faint">
                          {upload.status === "failed" ? "失败" : `${upload.progress}%`}
                        </span>
                        {upload.status === "uploading" ? (
                          <button
                            type="button"
                            onClick={() => onCancelUpload(upload.id)}
                            className="text-high hover:underline"
                          >
                            取消
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRetryUpload(upload.id)}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <RefreshCw className="h-3 w-3" aria-hidden />
                            重试
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunken">
                      <div
                        className={`h-full rounded-full transition-all ${
                          upload.status === "failed" ? "bg-high" : "bg-primary"
                        }`}
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    {upload.error && (
                      <p className="mt-2 text-xs text-high">{upload.error}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-soft">名称</span>
              <input
                value={linkName}
                onChange={(event) => onLinkNameChange(event.target.value)}
                placeholder="例如：项目源码仓库"
                className="ac-field"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-soft">链接</span>
              <input
                value={linkUrl}
                onChange={(event) => onLinkUrlChange(event.target.value)}
                placeholder="https://"
                className="ac-field"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-ink-soft">类型</span>
              <select
                value={linkKind}
                onChange={(event) =>
                  onLinkKindChange(event.target.value as ProjectFileKind)
                }
                className="ac-field"
              >
                <option value="presentation">PPT / 演示</option>
                <option value="document">文档</option>
                <option value="code">代码 / 仓库</option>
                <option value="video">视频</option>
                <option value="audio">音频</option>
                <option value="other">其他</option>
              </select>
            </label>
            {linkError && <p className="text-sm text-high">{linkError}</p>}
            <button type="button" onClick={onAddLink} className="ac-btn w-full">
              <Link2 className="h-4 w-4" aria-hidden />
              添加链接
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
