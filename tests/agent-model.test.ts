import { describe, it, expect } from "vitest";
import { aiFailureMessage } from "@/lib/agent/model";

describe("aiFailureMessage（接口故障翻译）", () => {
  it("401/403 → 密钥无效", () => {
    expect(aiFailureMessage({ statusCode: 401 })).toContain("API Key 无效");
    expect(aiFailureMessage({ statusCode: 403 })).toContain("API Key 无效");
  });

  it("404 或 invalid_request_error → 模型不存在", () => {
    expect(aiFailureMessage({ statusCode: 404 }, "deepseek-nope")).toContain("deepseek-nope");
    expect(aiFailureMessage(new Error("invalid_request_error: model not found"))).toContain(
      "模型不存在",
    );
  });

  it("网络层报错 → 连不上接口", () => {
    expect(aiFailureMessage(new Error("fetch failed"))).toContain("连不上接口地址");
    expect(aiFailureMessage(new Error("ETIMEDOUT"))).toContain("连不上接口地址");
  });

  it("认不出的错误交回调用方（null）", () => {
    expect(aiFailureMessage(new Error("boom"))).toBeNull();
    expect(aiFailureMessage(undefined)).toBeNull();
  });
});
