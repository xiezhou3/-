import { describe, expect, it } from "vitest";
import {
  filterProjectFiles,
  inferPrimaryLanguage,
  inferProjectFileKind,
  resolveProjectFileKind,
  sortProjectFiles,
  summarizeProjectFiles,
  type ProjectFile,
} from "@/lib/project-files";

function makeFile(
  id: string,
  name: string,
  kind: ProjectFile["kind"],
  options: Partial<ProjectFile> = {},
): ProjectFile {
  return {
    id,
    name,
    kind,
    source: "upload",
    owner: "测试用户",
    updatedAt: "2026-09-20T10:00:00.000Z",
    sizeBytes: 1024,
    ...options,
  };
}

describe("project file helpers", () => {
  it("按扩展名与 MIME 类型识别文件分类", () => {
    expect(inferProjectFileKind("答辩稿.pptx")).toBe("presentation");
    expect(inferProjectFileKind("说明.pdf")).toBe("document");
    expect(inferProjectFileKind("录屏.mp4")).toBe("video");
    expect(inferProjectFileKind("录音.mp3")).toBe("audio");
    expect(inferProjectFileKind("app.tsx")).toBe("code");
    expect(inferProjectFileKind("styles.css")).toBe("code");
    expect(inferProjectFileKind("schema.sql")).toBe("code");
    expect(inferProjectFileKind("data.bin", "application/octet-stream")).toBe("other");
    expect(inferProjectFileKind("unknown", "video/webm")).toBe("video");
    expect(inferPrimaryLanguage("app.tsx")).toBe("TypeScript");
    expect(inferPrimaryLanguage("main.py")).toBe("Python");
  });

  it("压缩包默认归为其他，但允许用户指定为代码", () => {
    expect(resolveProjectFileKind("site.zip", "application/zip", "auto")).toBe("other");
    expect(resolveProjectFileKind("site.zip", "application/zip", "code")).toBe("code");
  });

  it("生成文件统计", () => {
    const files = [
      makeFile("1", "汇报.pptx", "presentation"),
      makeFile("2", "演示.mp4", "video"),
      makeFile("3", "录音.mp3", "audio"),
      makeFile("4", "源码.zip", "code"),
      makeFile("5", "说明.pdf", "document"),
    ];
    const summary = summarizeProjectFiles(files);
    expect(summary.total).toBe(files.length);
    expect(summary.presentation).toBe(
      files.filter((file) => file.kind === "presentation").length,
    );
    expect(summary.video).toBe(
      files.filter((file) => file.kind === "video").length,
    );
    expect(summary.audio).toBe(
      files.filter((file) => file.kind === "audio").length,
    );
    expect(summary.code).toBe(
      files.filter((file) => file.kind === "code").length,
    );
  });

  it("支持分类与关键词筛选", () => {
    const files = [
      makeFile("1", "教学平台汇报.pptx", "presentation"),
      makeFile("2", "教学平台演示.mp4", "video"),
      makeFile("3", "教学平台源码.zip", "code"),
    ];
    const videos = filterProjectFiles(files, { kind: "video" });
    expect(videos.every((file) => file.kind === "video")).toBe(true);
    const code = filterProjectFiles(files, { kind: "code" });
    expect(code.length).toBeGreaterThan(0);
    expect(code.every((file) => file.kind === "code")).toBe(true);

    const target = files.find((file) => file.kind === "presentation")!;
    const query = filterProjectFiles(files, { query: target.name });
    expect(query).toHaveLength(1);
    expect(query[0].id).toBe(target.id);
  });

  it("支持按名称、大小和更新时间排序", () => {
    const files = [
      makeFile("1", "B文件.pdf", "document", {
        sizeBytes: 200,
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
      makeFile("2", "A文件.pdf", "document", {
        sizeBytes: 500,
        updatedAt: "2026-09-20T00:00:00.000Z",
      }),
    ];
    const byName = sortProjectFiles(files, "name");
    const bySize = sortProjectFiles(files, "size");
    const byUpdated = sortProjectFiles(files, "updated");

    expect(byName[0].name.localeCompare(byName.at(-1)!.name, "zh-CN")).toBeLessThanOrEqual(0);
    expect(bySize[0].sizeBytes ?? 0).toBeGreaterThanOrEqual(bySize.at(-1)!.sizeBytes ?? 0);
    expect(new Date(byUpdated[0].updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(byUpdated.at(-1)!.updatedAt).getTime(),
    );
  });
});
