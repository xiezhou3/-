import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  type ReadStream,
} from "node:fs";
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "./errors";

export type StorageWriteResult = {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
};

export interface FileStorage {
  writeUpload(input: {
    fileId: string;
    projectId: string;
    filename: string;
    stream: NodeJS.ReadableStream;
    expectedSize?: number;
    maxBytes: number;
  }): Promise<StorageWriteResult>;
  delete(storageKey: string): Promise<void>;
  deleteTemporaryUpload(fileId: string): Promise<void>;
  stat(storageKey: string): Promise<{ sizeBytes: number }>;
  createReadStream(
    storageKey: string,
    options?: { start?: number; end?: number },
  ): ReadStream;
  getLocalPath(storageKey: string): string;
  cleanupTemporaryUploads(olderThanMs: number): Promise<number>;
}

export class FileTooLargeError extends AppError {
  constructor(message = "文件超过允许的大小") {
    super(message);
  }
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async writeUpload(input: {
    fileId: string;
    projectId: string;
    filename: string;
    stream: NodeJS.ReadableStream;
    expectedSize?: number;
    maxBytes: number;
  }): Promise<StorageWriteResult> {
    const storageKey = this.buildStorageKey(
      input.projectId,
      input.fileId,
      input.filename,
    );
    const tempPath = this.pathFor(`.uploads/${input.fileId}.part`);
    const finalPath = this.pathFor(storageKey);
    await mkdir(this.pathFor(".uploads"), { recursive: true });
    await mkdir(resolve(finalPath, ".."), { recursive: true });

    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        sizeBytes += chunk.length;
        if (sizeBytes > input.maxBytes) {
          callback(
            new FileTooLargeError(
              `文件超过 ${Math.floor(input.maxBytes / 1024 / 1024)} MB 限制`,
            ),
          );
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        input.stream,
        meter,
        createWriteStream(tempPath, { flags: "w" }),
      );
      if (sizeBytes === 0) throw new AppError("不能上传空文件");
      if (input.expectedSize !== undefined && input.expectedSize !== sizeBytes) {
        throw new AppError("上传文件大小与声明不一致，请重新上传");
      }
      await rm(finalPath, { force: true });
      await rename(tempPath, finalPath);
      return {
        storageKey,
        sizeBytes,
        checksumSha256: hash.digest("hex"),
      };
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async delete(storageKey: string) {
    await rm(this.pathFor(storageKey), { force: true });
  }

  async deleteTemporaryUpload(fileId: string) {
    await rm(this.pathFor(`.uploads/${fileId}.part`), { force: true });
  }

  async stat(storageKey: string) {
    const fileStat = await stat(this.pathFor(storageKey));
    return { sizeBytes: fileStat.size };
  }

  createReadStream(
    storageKey: string,
    options?: { start?: number; end?: number },
  ) {
    return createReadStream(this.pathFor(storageKey), options);
  }

  getLocalPath(storageKey: string) {
    return this.pathFor(storageKey);
  }

  async cleanupTemporaryUploads(olderThanMs: number) {
    const directory = this.pathFor(".uploads");
    await mkdir(directory, { recursive: true });
    const entries = await readdir(directory, { withFileTypes: true });
    const cutoff = Date.now() - olderThanMs;
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".part")) continue;
      const path = join(directory, entry.name);
      const fileStat = await stat(path);
      if (fileStat.mtimeMs >= cutoff) continue;
      await rm(path, { force: true });
      removed++;
    }
    return removed;
  }

  private buildStorageKey(projectId: string, fileId: string, filename: string) {
    return `projects/${projectId}/${fileId}/${safeFilename(filename)}`;
  }

  private pathFor(storageKey: string) {
    const target = resolve(this.root, ...storageKey.split("/"));
    const rel = relative(this.root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
      throw new AppError("非法存储路径");
    }
    return target;
  }
}

export function safeFilename(filename: string) {
  const base = basename(filename).normalize("NFKC");
  const withoutControl = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  const cleaned = withoutControl.replace(/^\.+/, "").trim().slice(0, 160);
  return cleaned || "file";
}

let storage: FileStorage | null = null;

export function getFileStorage() {
  if (storage) return storage;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") {
    throw new AppError(`暂不支持的存储驱动：${driver}`);
  }
  const root =
    process.env.FILE_STORAGE_ROOT?.trim() ||
    resolve("storage");
  storage = new LocalFileStorage(root);
  return storage;
}

export function getMaxFileSizeBytes() {
  const configured = Number(process.env.MAX_FILE_SIZE_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 2 * 1024 * 1024 * 1024;
}
