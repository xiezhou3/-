"use client";

import { FileWarning, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type ViewerType = "video" | "audio" | "pdf" | "office" | "unsupported";

export function FileViewer({
  fileId,
  viewerType,
  contentUrl,
}: {
  fileId: string;
  viewerType: ViewerType;
  contentUrl: string;
}) {
  if (viewerType === "video") {
    return (
      <video
        src={contentUrl}
        controls
        preload="metadata"
        className="max-h-[80vh] w-full rounded-card bg-black"
      />
    );
  }

  if (viewerType === "audio") {
    return (
      <div className="ac-card flex min-h-64 items-center justify-center p-8">
        <audio src={contentUrl} controls preload="metadata" className="w-full max-w-2xl" />
      </div>
    );
  }

  if (viewerType === "pdf") {
    return (
      <iframe
        src={contentUrl}
        title="PDF 文件预览"
        className="h-[78vh] min-h-[560px] w-full rounded-card border border-line bg-white"
      />
    );
  }

  if (viewerType === "office") {
    return <OfficePdfViewer fileId={fileId} />;
  }

  return (
    <div className="ac-card flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <FileWarning className="h-12 w-12 text-ink-faint" strokeWidth={1.4} aria-hidden />
      <p className="font-medium text-ink">暂不支持在线预览</p>
      <p className="text-sm text-ink-soft">请使用上方下载按钮查看此文件。</p>
    </div>
  );
}

function OfficePdfViewer({ fileId }: { fileId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; url: string }
    | { status: "error"; error: string }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch(`/api/project-files/${fileId}/preview`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !data.url) {
          throw new Error(data.error || "预览准备失败");
        }
        if (active) setState({ status: "ready", url: data.url });
      })
      .catch((error) => {
        if (active) {
          setState({
            status: "error",
            error: error instanceof Error ? error.message : "预览准备失败",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [fileId]);

  if (state.status === "loading") {
    return (
      <div className="ac-card flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-ink-soft">正在准备完整预览，首次打开可能需要几秒。</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="ac-card flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
        <FileWarning className="h-10 w-10 text-high" aria-hidden />
        <p className="font-medium text-high">{state.error}</p>
        <p className="text-sm text-ink-soft">可以返回文件库后手动下载查看。</p>
      </div>
    );
  }

  return (
    <iframe
      src={state.url}
      title="Office 文件完整预览"
      className="h-[78vh] min-h-[560px] w-full rounded-card border border-line bg-white"
    />
  );
}
