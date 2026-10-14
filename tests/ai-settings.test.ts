import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAiSettings } from "@/db/schema";
import { createUser } from "@/lib/user";
import {
  clearAiSettings,
  getAiSettingsView,
  resolveAiConfig,
  saveAiSettings,
} from "@/lib/agent/ai-settings";
import { getModelForUser } from "@/lib/agent/model";
import { resetDb } from "./helpers";

async function makeUser(email = "ai@example.com") {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

describe("项目助手 AI 接口设置", () => {
  beforeEach(async () => {
    await resetDb();
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
  });

  it("未配置时视图为空、且无 .env 兜底", async () => {
    const user = await makeUser();
    const view = await getAiSettingsView(user.id);
    expect(view.configured).toBe(false);
    expect(view.envFallback).toBe(false);
    expect(view.keyHint).toBeNull();
    expect(view.model).toBe("deepseek-v4-flash");
  });

  it("保存后：密文落库、视图只回末尾提示、明文可解回", async () => {
    const user = await makeUser();
    const view = await saveAiSettings(user.id, {
      apiKey: "sk-live-abcdef1234",
      baseUrl: "https://api.deepseek.com/",
      model: "deepseek-v4-pro",
    });

    expect(view.configured).toBe(true);
    expect(view.keyHint).toBe("****1234");
    expect(view.baseUrl).toBe("https://api.deepseek.com");
    expect(view.model).toBe("deepseek-v4-pro");

    const [row] = await db
      .select()
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, user.id));
    expect(row.apiKeyCiphertext).not.toContain("sk-live");
    expect(row.apiKeyHint).toBe("****1234");

    await expect(resolveAiConfig(user.id)).resolves.toMatchObject({
      apiKey: "sk-live-abcdef1234",
      model: "deepseek-v4-pro",
    });
  });

  it("改模型不重输密钥时沿用已存密钥", async () => {
    const user = await makeUser();
    await saveAiSettings(user.id, { apiKey: "sk-first-9999", model: "deepseek-v4-flash" });
    const view = await saveAiSettings(user.id, { model: "deepseek-v4-pro" });

    expect(view.keyHint).toBe("****9999");
    await expect(resolveAiConfig(user.id)).resolves.toMatchObject({
      apiKey: "sk-first-9999",
      model: "deepseek-v4-pro",
    });
  });

  it("首次保存缺密钥被拒", async () => {
    const user = await makeUser();
    await expect(saveAiSettings(user.id, { model: "deepseek-v4-pro" })).rejects.toThrow("API Key");
  });

  it("清除后回退服务端 .env 密钥", async () => {
    const user = await makeUser();
    process.env.DEEPSEEK_API_KEY = "sk-env-fallback";
    await saveAiSettings(user.id, { apiKey: "sk-mine-1111" });

    const view = await clearAiSettings(user.id);
    expect(view.configured).toBe(false);
    expect(view.envFallback).toBe(true);
    await expect(resolveAiConfig(user.id)).resolves.toMatchObject({
      apiKey: "sk-env-fallback",
    });
  });

  it("两处都无密钥时拒绝出模型；本人配了就放行（纯构造，不发请求）", async () => {
    const user = await makeUser();
    await expect(getModelForUser(user.id)).rejects.toThrow("尚未连接 AI");

    await saveAiSettings(user.id, { apiKey: "sk-mine-2222" });
    await expect(getModelForUser(user.id)).resolves.toBeTruthy();
  });
});
