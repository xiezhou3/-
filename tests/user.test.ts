import { describe, it, expect, beforeEach } from "vitest";
import { changePassword, createUser, updateProfile } from "@/lib/user";
import { verifyPassword } from "@/lib/password";
import { AppError } from "@/lib/errors";
import { resetDb } from "./helpers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("createUser", () => {
  beforeEach(resetDb);

  it("创建用户并存哈希而非明文", async () => {
    const user = await createUser({
      email: "zhou@example.com",
      password: "password123",
      name: "周瑜",
    });
    expect(user.email).toBe("zhou@example.com");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.passwordHash).not.toBe("password123");
    expect(await verifyPassword("password123", row.passwordHash)).toBe(true);
  });

  it("重复邮箱抛出可展示错误", async () => {
    await createUser({ email: "dup@example.com", password: "password123", name: "甲" });
    await expect(
      createUser({ email: "dup@example.com", password: "password123", name: "乙" }),
    ).rejects.toThrow("该邮箱已被注册");
  });

  it("并发注册同一邮箱：恰一个成功，另一个收到可展示的 AppError", async () => {
    const input = { email: "race@example.com", password: "password123", name: "并" };
    const results = await Promise.allSettled([createUser(input), createUser(input)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(AppError);
    expect(reason.message).toBe("该邮箱已被注册");
  });

  it("绕过查重的唯一键冲突（23505）被转译为可展示的 AppError", async () => {
    const email = "locked@example.com";
    let releaseTx!: () => void;
    const hold = new Promise<void>((r) => (releaseTx = r));
    let markInserted!: () => void;
    const inserted = new Promise<void>((r) => (markInserted = r));

    // 事务先插入同邮箱但不提交：createUser 的查重（读已提交）看不到该行，
    // 其 insert 将阻塞在唯一索引锁上；事务提交后必现 23505，
    // 从而确定性地覆盖「查重通过但唯一约束拦截」的竞态路径。
    const tx = db.transaction(async (trx) => {
      await trx.insert(users).values({ email, passwordHash: "x", name: "先" });
      markInserted();
      await hold;
    });

    await inserted;
    const pending = createUser({ email, password: "password123", name: "后" });
    pending.catch(() => {}); // 预挂 handler，消除拒绝早于断言挂接的瞬时 unhandled rejection
    await new Promise((r) => setTimeout(r, 300)); // 让 createUser 完成查重并阻塞于 insert
    releaseTx();
    await tx;

    await expect(pending).rejects.toBeInstanceOf(AppError);
    await expect(pending).rejects.toThrow("该邮箱已被注册");
  });

  it("邮箱统一转小写存储，大小写不同视为同一邮箱", async () => {
    const user = await createUser({
      email: "Zhou@Example.COM",
      password: "password123",
      name: "周瑜",
    });
    expect(user.email).toBe("zhou@example.com");
    await expect(
      createUser({ email: "ZHOU@example.com", password: "password123", name: "乙" }),
    ).rejects.toThrow("该邮箱已被注册");
  });
});

describe("updateProfile", () => {
  beforeEach(resetDb);

  it("去除姓名首尾空格，且只更新目标用户", async () => {
    const target = await createUser({
      email: "target@example.com",
      password: "password123",
      name: "旧姓名",
    });
    const other = await createUser({
      email: "other@example.com",
      password: "password123",
      name: "其他用户",
    });

    const updated = await updateProfile(target.id, { name: "  新姓名  " });
    expect(updated.name).toBe("新姓名");

    const [targetRow] = await db.select().from(users).where(eq(users.id, target.id));
    const [otherRow] = await db.select().from(users).where(eq(users.id, other.id));
    expect(targetRow.name).toBe("新姓名");
    expect(otherRow.name).toBe("其他用户");
  });

  it("拒绝空姓名和超过 50 位的姓名", async () => {
    const user = await createUser({
      email: "validation@example.com",
      password: "password123",
      name: "原名",
    });

    await expect(updateProfile(user.id, { name: "   " })).rejects.toThrow("请填写姓名");
    await expect(updateProfile(user.id, { name: "甲".repeat(51) })).rejects.toThrow(
      "姓名最长 50 位",
    );
  });
});

describe("changePassword", () => {
  beforeEach(resetDb);

  it("当前密码错误时不修改原哈希", async () => {
    const user = await createUser({
      email: "wrong-current@example.com",
      password: "password123",
      name: "甲",
    });
    const [before] = await db.select().from(users).where(eq(users.id, user.id));

    await expect(
      changePassword(user.id, {
        currentPassword: "wrong-password",
        newPassword: "new-password123",
      }),
    ).rejects.toThrow("当前密码不正确");

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("当前密码正确时更新哈希，旧密码失效、新密码生效", async () => {
    const user = await createUser({
      email: "change-password@example.com",
      password: "password123",
      name: "甲",
    });

    await changePassword(user.id, {
      currentPassword: "password123",
      newPassword: "new-password123",
    });

    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(await verifyPassword("password123", after.passwordHash)).toBe(false);
    expect(await verifyPassword("new-password123", after.passwordHash)).toBe(true);
  });

  it("校验新密码长度边界", async () => {
    const user = await createUser({
      email: "password-bounds@example.com",
      password: "password123",
      name: "甲",
    });

    await expect(
      changePassword(user.id, { currentPassword: "password123", newPassword: "1234567" }),
    ).rejects.toThrow("新密码至少 8 位");
    await expect(
      changePassword(user.id, {
        currentPassword: "password123",
        newPassword: "x".repeat(65),
      }),
    ).rejects.toThrow("新密码最长 64 位");
  });

  it("飞书占位账号不能修改本地密码", async () => {
    const user = await createUser({
      email: "ou_managed@feishu.local",
      password: "password123",
      name: "飞书用户",
    });

    await expect(
      changePassword(user.id, {
        currentPassword: "password123",
        newPassword: "new-password123",
      }),
    ).rejects.toThrow("该账号通过飞书创建，请使用飞书登录");
  });
});
