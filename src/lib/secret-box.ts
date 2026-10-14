import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { AppError } from "./errors";

// 服务端本地加密箱：以 AUTH_SECRET 为口令派生 32 字节密钥，AES-256-GCM 带认证加密。
// 用途是让 AI API Key 不落明文——即便库文件外泄，没有 AUTH_SECRET 也解不出原文。
const SALT = "agilecampus:ai-key:v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new AppError("服务端未配置 AUTH_SECRET，无法加密保存密钥");
  return scryptSync(secret, SALT, 32);
}

// 输出 iv.tag.ciphertext（三段 base64），自包含，单列即可存
export function sealSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}

// 密文被截断、篡改或换过 AUTH_SECRET 时 GCM 校验失败并抛错，由调用方转成业务错误
export function openSecret(sealed: string): string {
  const [ivPart, tagPart, dataPart] = sealed.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new AppError("密钥密文格式无效");

  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// 界面回显用的末尾提示，例如 sk-abcd…wxyz → ****wxyz
export function secretHint(plain: string): string {
  const trimmed = plain.trim();
  return trimmed.length <= 4 ? "已保存" : `****${trimmed.slice(-4)}`;
}
