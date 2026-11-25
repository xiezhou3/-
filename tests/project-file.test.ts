import { Readable } from "node:stream";
import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projectFiles } from "@/db/schema";
import { createProject } from "@/lib/project";
import {
  createProjectFileLink,
  createProjectFileUpload,
  deleteProjectFile,
  listProjectFiles,
  writeProjectFileUpload,
} from "@/lib/project-file-service";
import { getFileStorage, safeFilename } from "@/lib/file-storage";
import { createTeam, joinTeam, updateMemberRole } from "@/lib/team";
import { createUser } from "@/lib/user";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function makeProject() {
  const owner = await makeUser("owner@example.com");
  const student = await makeUser("student@example.com");
  const other = await makeUser("other@example.com");
  const team = await createTeam(owner.id, "文件测试团队");
  await joinTeam(student.id, team.inviteCode);
  const project = await createProject(owner.id, team.id, { name: "文件测试项目" });
  return { owner, student, other, team, project };
}

describe("project file storage", () => {
  beforeEach(async () => {
    await resetDb();
    await rm(process.env.FILE_STORAGE_ROOT!, { recursive: true, force: true });
  });

  it("团队成员可以上传小文件并读取 ready 记录", async () => {
    const { owner, student, project } = await makeProject();
    const upload = await createProjectFileUpload(student.id, project.id, {
      name: "说明.pdf",
      sizeBytes: 5,
      mimeType: "application/pdf",
    });

    await writeProjectFileUpload(
      student.id,
      upload.id,
      Readable.from(Buffer.from("hello")),
      5,
    );

    const files = await listProjectFiles(owner.id, project.id);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      name: "说明.pdf",
      kind: "document",
      status: "ready",
      canDelete: true,
    });

    const [row] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, upload.id));
    expect(row.checksumSha256).toHaveLength(64);
    expect(row.storageKey).toContain(`projects/${project.id}/`);
    await expect(getFileStorage().stat(row.storageKey!)).resolves.toEqual({
      sizeBytes: 5,
    });
  });

  it("非项目成员不能创建或读取上传记录", async () => {
    const { other, project } = await makeProject();
    await expect(
      createProjectFileUpload(other.id, project.id, {
        name: "secret.pdf",
        sizeBytes: 1,
      }),
    ).rejects.toThrow("没有权限");
    await expect(listProjectFiles(other.id, project.id)).rejects.toThrow(
      "没有权限",
    );
  });

  it("上传大小超过限制时在写入前拒绝", async () => {
    const { student, project } = await makeProject();
    const previous = process.env.MAX_FILE_SIZE_BYTES;
    process.env.MAX_FILE_SIZE_BYTES = "4";
    try {
      await expect(
        createProjectFileUpload(student.id, project.id, {
          name: "large.bin",
          sizeBytes: 5,
        }),
      ).rejects.toThrow("超过");
    } finally {
      process.env.MAX_FILE_SIZE_BYTES = previous;
    }
  });

  it("后端拒绝未允许的可执行文件扩展名", async () => {
    const { student, project } = await makeProject();
    await expect(
      createProjectFileUpload(student.id, project.id, {
        name: "malware.exe",
        sizeBytes: 10,
      }),
    ).rejects.toThrow("暂不支持");
  });

  it("文件大小不一致时标记失败并清理临时文件", async () => {
    const { student, project } = await makeProject();
    const upload = await createProjectFileUpload(student.id, project.id, {
      name: "wrong.txt",
      sizeBytes: 10,
      mimeType: "text/plain",
    });

    await expect(
      writeProjectFileUpload(
        student.id,
        upload.id,
        Readable.from(Buffer.from("short")),
        5,
      ),
    ).rejects.toThrow("大小与声明不一致");

    const [row] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, upload.id));
    expect(row.status).toBe("failed");
  });

  it("链接可以持久化并参与列表统计", async () => {
    const { student, project } = await makeProject();
    await createProjectFileLink(student.id, project.id, {
      name: "源码仓库",
      url: "https://github.com/example/project",
      kind: "code",
    });

    const files = await listProjectFiles(student.id, project.id);
    expect(files).toHaveLength(1);
    expect(files[0].source).toBe("link");
    expect(files[0].url).toBe("https://github.com/example/project");
    expect(files[0].codeMeta?.primaryLanguage).toBe("Git Repository");
  });

  it("上传者和管理员可删除，其他成员不可删除", async () => {
    const { owner, student, team, project } = await makeProject();
    const teacher = await makeUser("teacher@example.com");
    await joinTeam(teacher.id, team.inviteCode);
    await updateMemberRole(owner.id, team.id, teacher.id, "teacher");

    const upload = await createProjectFileUpload(student.id, project.id, {
      name: "delete.txt",
      sizeBytes: 1,
      mimeType: "text/plain",
    });
    await writeProjectFileUpload(
      student.id,
      upload.id,
      Readable.from(Buffer.from("x")),
      1,
    );

    await expect(deleteProjectFile(teacher.id, upload.id)).rejects.toThrow(
      "只有上传者或管理员",
    );
    await deleteProjectFile(owner.id, upload.id);
    expect(await listProjectFiles(owner.id, project.id)).toHaveLength(0);
  });

  it("安全化文件名并阻止路径穿越", () => {
    expect(safeFilename("../../secret.env")).toBe("secret.env");
    expect(safeFilename("..\\..\\secret.env")).toBe("secret.env");
  });
});
