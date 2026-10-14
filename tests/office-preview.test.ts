import { Readable } from "node:stream";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteOfficePdfPreview,
  ensureOfficePdfPreview,
} from "@/lib/office-preview";
import { getFileStorage } from "@/lib/file-storage";

async function makeOfficeFile(id: string) {
  const stored = await getFileStorage().writeUpload({
    fileId: id,
    projectId: "project-office",
    filename: "report.docx",
    stream: Readable.from(Buffer.from("fake-docx")),
    maxBytes: 1024,
  });
  return {
    id,
    name: "report.docx",
    storageKey: stored.storageKey,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

describe("office preview", () => {
  beforeEach(async () => {
    await rm(process.env.FILE_STORAGE_ROOT!, { recursive: true, force: true });
  });

  it("转换成功后写入缓存，后续命中缓存不再运行转换器", async () => {
    const file = await makeOfficeFile("office-1");
    let calls = 0;
    const runner = async ({ outputDir }: { outputDir: string }) => {
      calls++;
      await writeFile(join(outputDir, "report.pdf"), Buffer.from("%PDF-1.4"));
    };

    const first = await ensureOfficePdfPreview(file, { runner });
    const second = await ensureOfficePdfPreview(file, {
      runner: async () => {
        calls++;
      },
    });
    expect(second).toBe(first);
    expect(calls).toBe(1);
    await expect(getFileStorage().stat(first)).resolves.toMatchObject({
      sizeBytes: 8,
    });
  });

  it("同一文件并发预览只执行一次转换", async () => {
    const file = await makeOfficeFile("office-2");
    let calls = 0;
    const runner = async ({ outputDir }: { outputDir: string }) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      await writeFile(join(outputDir, "report.pdf"), Buffer.from("%PDF-1.4"));
    };

    const [first, second] = await Promise.all([
      ensureOfficePdfPreview(file, { runner }),
      ensureOfficePdfPreview(file, { runner }),
    ]);
    expect(first).toBe(second);
    expect(calls).toBe(1);
  });

  it("转换失败时不写缓存", async () => {
    const file = await makeOfficeFile("office-3");
    await expect(
      ensureOfficePdfPreview(file, {
        runner: async () => {
          throw new Error("converter failed");
        },
      }),
    ).rejects.toThrow("转换失败");
    await expect(
      getFileStorage().stat(".previews/office-3.pdf"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("转换超时会终止等待并返回可展示错误", async () => {
    const file = await makeOfficeFile("office-4");
    await expect(
      ensureOfficePdfPreview(file, {
        timeoutMs: 20,
        runner: ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          }),
      }),
    ).rejects.toThrow("转换超时");
  });

  it("删除文件时可清理 PDF 缓存", async () => {
    const file = await makeOfficeFile("office-5");
    const key = await ensureOfficePdfPreview(file, {
      runner: async ({ outputDir }) => {
        await writeFile(join(outputDir, "report.pdf"), Buffer.from("%PDF-1.4"));
      },
    });
    await deleteOfficePdfPreview(file.id);
    await expect(getFileStorage().stat(key)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
