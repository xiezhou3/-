// 项目助手「AI 设置」的对外视图。放在独立文件里，服务端 lib 与客户端组件共用，
// 免得客户端为了一个类型去 import 带 db 依赖的服务端模块。
export type AiSettingsView = {
  /** 本人是否已保存密钥 */
  configured: boolean;
  /** 未保存本人密钥、但服务端 .env 配了 DEEPSEEK_API_KEY 时仍可用 */
  envFallback: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  /** 形如 ****a1b2；绝不回传明文 */
  keyHint: string | null;
  updatedAtLabel: string | null;
};
