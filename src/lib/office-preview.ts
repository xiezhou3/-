import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { AppError } from "./errors";
import { getFileStorage } from "./file-storage";

type OfficePreviewFile = {
  id: string;
  name: string;
  storageKey: string | null;
  mimeType?: string | null;
};

export type OfficeConversionRequest = {
  sourcePath: string;
  outputDir: string;
  profileDir: string;
  signal: AbortSignal;
};

export type OfficeConversionRunner = (
  request: OfficeConversionRequest,
) => Promise<void>;

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx"]);
const inFlight = new Map<string, Promise<string>>();
const DEFAULT_TIMEOUT_MS = 60_000;

export function isOfficePreviewFile(file: {
  name: string;
  mimeType?: string | null;
}) {
  const extension = extname(file.name).slice(1).toLowerCase();
  if (OFFICE_EXTENSIONS.has(extension)) return true;
  const mime = file.mimeType?.toLowerCase() ?? "";
  return mime.includes("wordprocessingml") || mime.includes("presentationml");
}

export function officePreviewStorageKey(fileId: string) {
  return `.previews/${fileId}.pdf`;
}

export async function ensureOfficePdfPreview(
  file: OfficePreviewFile,
  options: {
    runner?: OfficeConversionRunner;
    timeoutMs?: number;
  } = {},
) {
  if (!file.storageKey) throw new AppError("文件尚未上传完成");
  const previewKey = officePreviewStorageKey(file.id);
  const storage = getFileStorage();

  try {
    await storage.stat(previewKey);
    return previewKey;
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }

  const existing = inFlight.get(file.id);
  if (existing) return existing;

  const task = convertToPdf(file, previewKey, options).finally(() => {
    inFlight.delete(file.id);
  });
  inFlight.set(file.id, task);
  return task;
}

export async function deleteOfficePdfPreview(fileId: string) {
  await getFileStorage().delete(officePreviewStorageKey(fileId));
}

export async function cleanupOfficePreviewTemporaryFiles(olderThanMs: number) {
  const storage = getFileStorage();
  const tempRoot = storage.getLocalPath(".previews/.tmp");
  await mkdir(tempRoot, { recursive: true });
  const entries = await readdir(tempRoot, { withFileTypes: true });
  const cutoff = Date.now() - olderThanMs;
  let removed = 0;
  for (const entry of entries) {
    const path = join(tempRoot, entry.name);
    const fileStat = await stat(path);
    if (fileStat.mtimeMs >= cutoff) continue;
    await rm(path, { recursive: true, force: true });
    removed++;
  }
  return removed;
}

async function convertToPdf(
  file: OfficePreviewFile,
  previewKey: string,
  options: {
    runner?: OfficeConversionRunner;
    timeoutMs?: number;
  },
) {
  const storage = getFileStorage();
  const sourcePath = storage.getLocalPath(file.storageKey!);
  const tempRoot = storage.getLocalPath(
    `.previews/.tmp/${file.id}-${randomUUID()}`,
  );
  const inputDir = join(tempRoot, "input");
  const outputDir = join(tempRoot, "output");
  const profileDir = join(tempRoot, "profile");
  const extension = extname(file.name) || ".bin";
  const inputPath = join(inputDir, `${basename(file.id)}${extension}`);
  const finalPath = storage.getLocalPath(previewKey);

  await Promise.all([
    mkdir(inputDir, { recursive: true }),
    mkdir(outputDir, { recursive: true }),
    mkdir(profileDir, { recursive: true }),
  ]);
  await copyFile(/* turbopackIgnore: true */ sourcePath, inputPath);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const runner = options.runner ?? runLibreOfficeConversion;
    await runner({
      sourcePath: inputPath,
      outputDir,
      profileDir,
      signal: controller.signal,
    });
    const outputFiles = await readdir(/* turbopackIgnore: true */ outputDir);
    const pdfName = outputFiles.find(
      (name) => extname(name).toLowerCase() === ".pdf",
    );
    if (!pdfName) {
      throw new AppError("Office 转换未生成 PDF");
    }

    await mkdir(dirname(finalPath), { recursive: true });
    const partPath = `${finalPath}.${randomUUID()}.part`;
    await copyFile(join(outputDir, pdfName), partPath);
    await rm(finalPath, { force: true });
    await rename(partPath, finalPath);
    return previewKey;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError("Office 文件转换超时，请稍后重试");
    }
    if (error instanceof AppError) throw error;
    throw new AppError("Office 文件转换失败，请下载后查看");
  } finally {
    clearTimeout(timeout);
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runLibreOfficeConversion({
  sourcePath,
  outputDir,
  profileDir,
  signal,
}: OfficeConversionRequest) {
  const childProcess = (
    process as typeof process & {
      getBuiltinModule?: (id: string) => unknown;
    }
  ).getBuiltinModule?.("node:child_process") as
    | typeof import("node:child_process")
    | undefined;
  if (!childProcess) throw new AppError("当前 Node.js 不支持进程启动接口");

  const executable = await findLibreOfficeExecutable();
  const args = [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--headless",
    "--nologo",
    "--nodefault",
    "--norestore",
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    sourcePath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = childProcess.spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16_000) stderr += String(chunk);
    });
    const abort = () => {
      child.kill();
      reject(new Error("Office conversion aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          stderr.trim() || `LibreOffice exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function findLibreOfficeExecutable() {
  const configured = process.env.LIBREOFFICE_PATH?.trim();
  if (configured) {
    return configured;
  }

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ];
    for (const candidate of candidates) {
      if (existsSync(/* turbopackIgnore: true */ candidate)) {
        return candidate;
      }
    }
  }

  return "soffice";
}
