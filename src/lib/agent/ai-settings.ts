import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAiSettings } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { openSecret, sealSecret, secretHint } from "@/lib/secret-box";
import type { AiSettingsView } from "@/types/ai-settings";

export const DEFAULT_PROVIDER = "deepseek";
export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MODEL = "deepseek-v4-flash";

/** 解出的可用配置：apiKey 是明文，只在服务端内存里流转，绝不出接口 */
export type AiModelConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type AiSettingsInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
};

function fmt(d: Date | null): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function requireBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/\S+$/.test(trimmed)) {
    throw new AppError("接口地址须以 http:// 或 https:// 开头");
  }
  return trimmed;
}

function requireModel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AppError("请填写模型名");
  return trimmed;
}

// 服务端 .env 兜底密钥：团队未各自配置时仍可用同一把 key
function envApiKey(): string | undefined {
  return envValue("DEEPSEEK_API_KEY");
}

// 空串按未配置处理，免得 .env 里留了个 `DEEPSEEK_MODEL=` 就把默认值顶掉
function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

async function findRow(userId: string) {
  const [row] = await db
    .select()
    .from(userAiSettings)
    .where(eq(userAiSettings.userId, userId));
  return row ?? null;
}

// 界面视图：只给末尾提示，不给明文、不给密文
export async function getAiSettingsView(userId: string): Promise<AiSettingsView> {
  const row = await findRow(userId);
  return {
    configured: row !== null,
    envFallback: envApiKey() !== undefined,
    provider: row?.provider ?? DEFAULT_PROVIDER,
    baseUrl: row?.baseUrl ?? envValue("DEEPSEEK_BASE_URL") ?? DEFAULT_BASE_URL,
    model: row?.model ?? envValue("DEEPSEEK_MODEL") ?? DEFAULT_MODEL,
    keyHint: row?.apiKeyHint ?? null,
    updatedAtLabel: fmt(row?.updatedAt ?? null),
  };
}

// 保存（或更新）本人 AI 配置。apiKey 留空＝沿用已存的密钥，便于只改模型/地址。
export async function saveAiSettings(
  userId: string,
  input: AiSettingsInput,
): Promise<AiSettingsView> {
  const existing = await findRow(userId);
  const apiKey = input.apiKey?.trim();

  if (!apiKey && !existing) throw new AppError("请填写 API Key");

  const base = {
    provider: input.provider?.trim() || existing?.provider || DEFAULT_PROVIDER,
    baseUrl: input.baseUrl ? requireBaseUrl(input.baseUrl) : existing?.baseUrl ?? DEFAULT_BASE_URL,
    model: input.model ? requireModel(input.model) : existing?.model ?? DEFAULT_MODEL,
  };
  // 明文只在这一刻经加密箱，之后仅存密文与末尾提示
  const keyPatch = apiKey
    ? { apiKeyCiphertext: sealSecret(apiKey), apiKeyHint: secretHint(apiKey) }
    : null;

  if (existing) {
    await db
      .update(userAiSettings)
      .set({ ...base, ...keyPatch, updatedAt: new Date() })
      .where(eq(userAiSettings.id, existing.id));
  } else {
    if (!keyPatch) throw new AppError("请填写 API Key");
    await db.insert(userAiSettings).values({ userId, ...base, ...keyPatch });
  }

  return getAiSettingsView(userId);
}

// 撤销本人配置，退回 .env 兜底（若有）
export async function clearAiSettings(userId: string): Promise<AiSettingsView> {
  await db.delete(userAiSettings).where(eq(userAiSettings.userId, userId));
  return getAiSettingsView(userId);
}

// 解析出真正要用的配置：本人密钥优先，其次 .env。都没有则 null（调用方给引导语）。
export async function resolveAiConfig(
  userId: string,
  override: AiSettingsInput = {},
): Promise<AiModelConfig | null> {
  const row = await findRow(userId);
  const apiKey = override.apiKey?.trim() || (row ? openSecret(row.apiKeyCiphertext) : envApiKey());
  if (!apiKey) return null;

  return {
    provider: override.provider?.trim() || row?.provider || DEFAULT_PROVIDER,
    baseUrl: override.baseUrl
      ? requireBaseUrl(override.baseUrl)
      : row?.baseUrl ?? envValue("DEEPSEEK_BASE_URL") ?? DEFAULT_BASE_URL,
    model: override.model
      ? requireModel(override.model)
      : row?.model ?? envValue("DEEPSEEK_MODEL") ?? DEFAULT_MODEL,
    apiKey,
  };
}
