import { describe, it, expect, beforeEach, vi } from "vitest";
import { createUser } from "@/lib/user";
import { GET, PUT, DELETE } from "@/app/api/ai-settings/route";
import { resetDb } from "./helpers";

// 只桩掉会话，route 内部其余（zod、库读写、加密）全走真家伙
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));

async function asUser(id: string) {
  authMock.mockResolvedValue({ user: { id } });
}

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/ai-settings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/ai-settings", () => {
  beforeEach(async () => {
    await resetDb();
    authMock.mockReset();
  });

  it("未登录一律 401", async () => {
    authMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PUT(jsonRequest("PUT", { apiKey: "sk-x" }))).status).toBe(401);
    expect((await DELETE()).status).toBe(401);
  });

  it("保存后回显掩码密钥，明文不出接口；清除后回到未配置", async () => {
    const user = await createUser({
      email: "route@example.com",
      password: "password123",
      name: "route",
    });
    await asUser(user.id);

    const saved = await PUT(
      jsonRequest("PUT", { apiKey: "sk-route-4321", model: "deepseek-v4-pro" }),
    );
    expect(saved.status).toBe(200);
    const view = await saved.json();
    expect(view.configured).toBe(true);
    expect(view.keyHint).toBe("****4321");
    expect(view.model).toBe("deepseek-v4-pro");
    expect(JSON.stringify(view)).not.toContain("sk-route-4321");

    const fetched = await (await GET()).json();
    expect(fetched.configured).toBe(true);
    expect(fetched.keyHint).toBe("****4321");

    const cleared = await (await DELETE()).json();
    expect(cleared.configured).toBe(false);
    expect(cleared.keyHint).toBeNull();
  });

  it("字段超长/非法地址 → 400", async () => {
    const user = await createUser({
      email: "route2@example.com",
      password: "password123",
      name: "route2",
    });
    await asUser(user.id);

    const tooLong = await PUT(jsonRequest("PUT", { apiKey: "k".repeat(300) }));
    expect(tooLong.status).toBe(400);

    const badUrl = await PUT(
      jsonRequest("PUT", { apiKey: "sk-ok-1234", baseUrl: "ftp://nope" }),
    );
    expect(badUrl.status).toBe(400);
  });
});
