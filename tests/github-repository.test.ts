import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGitHubRepository,
  parseGitHubRepositoryUrl,
  uploadGitHubFile,
} from "@/lib/github-repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub repository helpers", () => {
  it("解析常见 GitHub 仓库地址", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/openai/openai-node")).toEqual({
      owner: "openai",
      name: "openai-node",
    });
    expect(
      parseGitHubRepositoryUrl("https://github.com/openai/openai-node/tree/main/src"),
    ).toEqual({ owner: "openai", name: "openai-node" });
    expect(parseGitHubRepositoryUrl("git@github.com:openai/openai-node.git")).toEqual({
      owner: "openai",
      name: "openai-node",
    });
  });

  it("拒绝非 GitHub 地址和越界路径", () => {
    expect(() => parseGitHubRepositoryUrl("https://example.com/a/b")).toThrow(
      "仅支持 github.com",
    );
    expect(() =>
      parseGitHubRepositoryUrl("https://github.com/%2E%2E/repo"),
    ).toThrow("仓库地址");
  });

  it("读取仓库元数据和最新提交", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/commits?per_page=1")) {
        return Response.json([
          {
            sha: "abcdef1234567890",
            html_url: "https://github.com/openai/example/commit/abcdef1",
            commit: { message: "Initial commit\n\nBody" },
          },
        ]);
      }
      return Response.json({
        name: "example",
        full_name: "openai/example",
        html_url: "https://github.com/openai/example",
        description: "Example repository",
        default_branch: "main",
        visibility: "public",
        language: "TypeScript",
        stargazers_count: 12,
        forks_count: 3,
        open_issues_count: 2,
        owner: { login: "openai" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = await fetchGitHubRepository("openai", "example", "token");
    expect(repository).toMatchObject({
      fullName: "openai/example",
      defaultBranch: "main",
      stars: 12,
      forks: 3,
      openIssues: 2,
      latestCommitMessage: "Initial commit",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("创建或更新仓库文件时提交 base64 内容", async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return Response.json({
            commit: {
              sha: "commit-sha",
              html_url: "https://github.com/openai/example/commit/commit-sha",
            },
          });
        }
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadGitHubFile(
      "openai",
      "example",
      "docs/readme.txt",
      Buffer.from("hello"),
      { branch: "main", message: "Upload readme", token: "token" },
    );

    expect(result).toMatchObject({
      path: "docs/readme.txt",
      commitSha: "commit-sha",
    });
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeTruthy();
    const body = JSON.parse(String(putCall?.[1]?.body));
    expect(body).toMatchObject({
      message: "Upload readme",
      branch: "main",
      content: Buffer.from("hello").toString("base64"),
    });
  });
});
