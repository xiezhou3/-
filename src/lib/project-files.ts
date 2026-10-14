export type ProjectFileKind =
  | "presentation"
  | "document"
  | "code"
  | "video"
  | "audio"
  | "other";

export type ProjectFileSource = "upload" | "link";
export type ProjectFileStatus = "uploading" | "ready" | "failed";

export type ProjectCodeMeta = {
  primaryLanguage?: string;
  directories: string[];
  hasReadme: boolean;
  fileCount?: number;
};

export type ProjectFile = {
  id: string;
  name: string;
  kind: ProjectFileKind;
  source: ProjectFileSource;
  url?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  codeMeta?: ProjectCodeMeta;
  owner: string;
  updatedAt: string;
};

export type StoredProjectFile = ProjectFile & {
  status: ProjectFileStatus;
  mimeType?: string | null;
  canDelete: boolean;
};

export type ProjectFileSummary = {
  total: number;
  presentation: number;
  video: number;
  audio: number;
  code: number;
};

export type ProjectFileSort = "updated" | "name" | "size";

export const PROJECT_FILE_KIND_LABEL: Record<ProjectFileKind, string> = {
  presentation: "PPT",
  document: "文档",
  code: "代码",
  video: "视频",
  audio: "音频",
  other: "其他",
};

export function inferProjectFileKind(
  filename: string,
  mimeType = "",
): ProjectFileKind {
  const extension = fileExtension(filename);
  if (mimeType.startsWith("video/") || ["mp4", "mov", "webm", "avi", "mkv"].includes(extension)) {
    return "video";
  }
  if (mimeType.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "flac"].includes(extension)) {
    return "audio";
  }
  if (["ppt", "pptx", "key"].includes(extension)) return "presentation";
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "html",
      "css",
      "scss",
      "vue",
      "svelte",
      "py",
      "java",
      "go",
      "rs",
      "sql",
      "json",
      "yml",
      "yaml",
      "toml",
      "sh",
      "ps1",
    ].includes(extension)
  ) {
    return "code";
  }
  if (["pdf", "doc", "docx", "xls", "xlsx", "txt", "md"].includes(extension)) {
    return "document";
  }
  return "other";
}

export function resolveProjectFileKind(
  filename: string,
  mimeType: string,
  classification: ProjectFileKind | "auto",
) {
  return classification === "auto"
    ? inferProjectFileKind(filename, mimeType)
    : classification;
}

export function inferPrimaryLanguage(filename: string) {
  const extension = fileExtension(filename);
  const languages: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    vue: "Vue",
    svelte: "Svelte",
    py: "Python",
    java: "Java",
    go: "Go",
    rs: "Rust",
    sql: "SQL",
    json: "JSON",
    yml: "YAML",
    yaml: "YAML",
    toml: "TOML",
    sh: "Shell",
    ps1: "PowerShell",
  };
  return languages[extension];
}

function fileExtension(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz")) return "tar.gz";
  if (lower.endsWith(".tgz")) return "tgz";
  return lower.split(".").pop() ?? "";
}

export function isAllowedProjectFile(filename: string) {
  const extension = fileExtension(filename);
  return [
    "ppt",
    "pptx",
    "key",
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "txt",
    "md",
    "mp4",
    "mov",
    "webm",
    "avi",
    "mkv",
    "mp3",
    "wav",
    "m4a",
    "aac",
    "flac",
    "zip",
    "tar.gz",
    "tgz",
    "rar",
    "7z",
    "ts",
    "tsx",
    "js",
    "jsx",
    "html",
    "css",
    "scss",
    "vue",
    "svelte",
    "py",
    "java",
    "go",
    "rs",
    "sql",
    "json",
    "yml",
    "yaml",
    "toml",
    "sh",
    "ps1",
  ].includes(extension);
}

export function summarizeProjectFiles(files: ProjectFile[]): ProjectFileSummary {
  return files.reduce<ProjectFileSummary>(
    (summary, file) => {
      summary.total++;
      if (file.kind === "presentation") summary.presentation++;
      if (file.kind === "video") summary.video++;
      if (file.kind === "audio") summary.audio++;
      if (file.kind === "code") summary.code++;
      return summary;
    },
    { total: 0, presentation: 0, video: 0, audio: 0, code: 0 },
  );
}

export function filterProjectFiles<T extends ProjectFile>(
  files: T[],
  options: {
    query?: string;
    kind?: ProjectFileKind | "all";
  } = {},
) {
  const query = options.query?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const kind = options.kind ?? "all";
  return files.filter((file) => {
    const matchesKind = kind === "all" || file.kind === kind;
    const matchesQuery =
      !query ||
      file.name.toLocaleLowerCase("zh-CN").includes(query) ||
      file.owner.toLocaleLowerCase("zh-CN").includes(query);
    return matchesKind && matchesQuery;
  });
}

export function sortProjectFiles<T extends ProjectFile>(
  files: T[],
  sort: ProjectFileSort,
): T[] {
  return [...files].sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name, "zh-CN");
    }
    if (sort === "size") {
      return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function formatFileSize(bytes?: number) {
  if (bytes === undefined) return "外部链接";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatFileDuration(seconds?: number) {
  if (seconds === undefined) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatProjectFileTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
