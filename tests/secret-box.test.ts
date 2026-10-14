import { describe, it, expect } from "vitest";
import { openSecret, sealSecret, secretHint } from "@/lib/secret-box";

describe("secret-box（AI 密钥加密箱）", () => {
  it("加密后能原样解回，且密文不含明文片段", () => {
    const sealed = sealSecret("sk-abcdef123456");
    expect(sealed).not.toContain("sk-abcdef");
    expect(openSecret(sealed)).toBe("sk-abcdef123456");
  });

  it("同一明文两次加密密文不同（随机 iv）", () => {
    expect(sealSecret("sk-same")).not.toBe(sealSecret("sk-same"));
  });

  it("密文被篡改或格式不对则拒绝解开", () => {
    const sealed = sealSecret("sk-abcdef123456");
    const [iv, tag, data] = sealed.split(".");
    const flipped = data.startsWith("A") ? `B${data.slice(1)}` : `A${data.slice(1)}`;
    expect(() => openSecret([iv, tag, flipped].join("."))).toThrow();
    expect(() => openSecret("not-a-sealed-value")).toThrow();
  });

  it("回显提示只留末四位", () => {
    expect(secretHint("sk-abcdef123456")).toBe("****3456");
    expect(secretHint("abc")).toBe("已保存");
  });
});
