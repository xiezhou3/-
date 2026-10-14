import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type LanguageModel } from "ai";
import { AppError } from "@/lib/errors";
import {
  resolveAiConfig,
  type AiModelConfig,
  type AiSettingsInput,
} from "./ai-settings";

// 番号说明：DeepSeek 已废弃 deepseek-chat（现返 400 invalid_request_error），现行 v4 系列。
// flash 迅捷省耗，适配项目管理助手的短问答+工具调用；重推理可换 deepseek-v4-pro。
const DEFAULT_PROVIDER_NAME = "deepseek";

/** 按配置造一个 OpenAI 兼容模型实例。纯对象构造，不发网络请求。 */
export function createModel(config: AiModelConfig): LanguageModel {
  const provider = createOpenAICompatible({
    name: config.provider.trim() || DEFAULT_PROVIDER_NAME,
    baseURL: config.baseUrl,
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  return provider(config.model);
}

// 取本次对话要用的模型：本人「AI 设置」里存的密钥优先，其次服务端 .env 的 DEEPSEEK_API_KEY。
// 两处都没有则抛出可读错误，界面据此引导去配置。
export async function getModelForUser(userId: string): Promise<LanguageModel> {
  const config = await resolveAiConfig(userId);
  if (!config) {
    throw new AppError("尚未连接 AI：请在项目助手右上角的「AI 设置」中填入 API Key");
  }
  return createModel(config);
}

export type AiConnectionTest =
  | { ok: true; model: string; baseUrl: string }
  | { ok: false; error: string };

/** 把供应商/网络层错误翻成人话；认不出来则返回 null，由调用方按原样处理。 */
export function aiFailureMessage(error: unknown, modelName?: string): string | null {
  if (error instanceof AppError) return error.message;
  const status = (error as { statusCode?: number } | undefined)?.statusCode;
  const message = error instanceof Error ? error.message : "";

  if (status === 401 || status === 403) return "API Key 无效，或没有该模型的调用权限";
  if (status === 404 || /invalid_request_error|model[_ ]not[_ ]found|does not exist/i.test(message)) {
    return modelName ? `模型「${modelName}」不存在，请检查模型名` : "模型不存在，请检查模型名";
  }
  if (status === 429) return "调用额度或频率超限，请稍后再试";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timed? ?out|aborted/i.test(message)) {
    return "连不上接口地址，请检查网络与 Base URL";
  }
  return null;
}

function friendlyError(error: unknown, modelName?: string): string {
  const known = aiFailureMessage(error, modelName);
  if (known) return known;
  return error instanceof Error && error.message ? error.message : "连接失败";
}

/** 「测试连接」：用给定（或已保存）的配置真发一次极小的请求，验证密钥可用。 */
export async function testAiConnection(
  userId: string,
  override: AiSettingsInput = {},
): Promise<AiConnectionTest> {
  let config: AiModelConfig | null;
  try {
    config = await resolveAiConfig(userId, override);
  } catch (error) {
    return { ok: false, error: friendlyError(error, override.model) };
  }
  if (!config) return { ok: false, error: "请先填入 API Key" };

  try {
    await generateText({
      model: createModel(config),
      prompt: "ping",
      maxOutputTokens: 4,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(20_000),
    });
    return { ok: true, model: config.model, baseUrl: config.baseUrl };
  } catch (error) {
    return { ok: false, error: friendlyError(error, config.model) };
  }
}
