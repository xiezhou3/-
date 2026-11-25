import { z } from "zod";
import { AppError } from "./errors";

const GITHUB_API_URL = "https://api.github.com";

const githubRepositorySchema = z.object({
  name: z.string(),
  full_name: z.string(),
  html_url: z.url(),
  description: z.string().nullable().optional(),
  default_branch: z.string(),
  visibility: z.string().optional(),
  language: z.string().nullable().optional(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  open_issues_count: z.number().int().nonnegative(),
  owner: z.object({
    login: z.string(),
  }),
});

const githubCommitSchema = z.object({
  sha: z.string(),
  html_url: z.url(),
  commit: z.object({
    message: z.string(),
  }),
});

const githubTreeSchema = z.object({
  truncated: z.boolean().optional(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      size: z.number().int().nonnegative().optional(),
      sha: z.string(),
    }),
  ),
});

const githubContentSchema = z.object({
  type: z.literal("file"),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  size: z.number().int().nonnegative(),
  encoding: z.literal("base64"),
  content: z.string(),
  download_url: z.url().nullable().optional(),
});

const githubWriteSchema = z.object({
  commit: z.object({
    sha: z.string(),
    html_url: z.url(),
  }),
});

export type ParsedGitHubRepository = {
  owner: string;
  name: string;
};

export type GithubRepositorySnapshot = {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  defaultBranch: string;
  visibility: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  latestCommitSha: string | null;
  latestCommitMessage: string | null;
  latestCommitUrl: string | null;
  fetchedAt: Date;
};

export type GitHubTreeEntry = {
  path: string;
  size: number | null;
  sha: string;
};

export const GITHUB_CONTENTS_MAX_BYTES = 20 * 1024 * 1024;

export function parseGitHubRepositoryUrl(input: string): ParsedGitHubRepository {
  let value = input.trim();
  if (!value) throw new AppError("请输入 GitHub 仓库地址");

  if (/^git@github\.com:/i.test(value)) {
    value = `https://github.com/${value.replace(/^git@github\.com:/i, "")}`;
  } else if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("GitHub 仓库地址格式不正确");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new AppError("仅支持 github.com 仓库地址");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new AppError("仓库地址需包含所有者和仓库名");
  }

  let owner: string;
  let name: string;
  try {
    owner = decodeURIComponent(segments[0]);
    name = decodeURIComponent(segments[1]).replace(/\.git$/i, "");
  } catch {
    throw new AppError("GitHub 仓库地址格式不正确");
  }

  const segmentPattern = /^[A-Za-z0-9_.-]+$/;
  if (
    !segmentPattern.test(owner) ||
    !segmentPattern.test(name) ||
    name === "." ||
    name === ".."
  ) {
    throw new AppError("GitHub 仓库地址格式不正确");
  }

  return { owner, name };
}

export async function fetchGitHubRepository(
  owner: string,
  name: string,
  token = process.env.GITHUB_TOKEN,
): Promise<GithubRepositorySnapshot> {
  const encodedOwner = encodeURIComponent(owner);
  const encodedName = encodeURIComponent(name);
  const repositoryResponse = await githubFetch(
    `/repos/${encodedOwner}/${encodedName}`,
    token,
  );
  const repository = githubRepositorySchema.parse(
    await repositoryResponse.json(),
  );

  let latestCommit: z.infer<typeof githubCommitSchema> | null = null;
  try {
    const commitsResponse = await githubFetch(
      `/repos/${encodedOwner}/${encodedName}/commits?per_page=1`,
      token,
    );
    const commits = z.array(githubCommitSchema).parse(
      await commitsResponse.json(),
    );
    latestCommit = commits[0] ?? null;
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode !== 409) {
      throw error;
    }
  }

  return {
    owner: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
    htmlUrl: repository.html_url,
    description: repository.description?.trim() || null,
    defaultBranch: repository.default_branch,
    visibility: repository.visibility?.toLowerCase() ?? null,
    language: repository.language ?? null,
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    openIssues: repository.open_issues_count,
    latestCommitSha: latestCommit?.sha ?? null,
    latestCommitMessage:
      latestCommit?.commit.message.split("\n")[0]?.trim() || null,
    latestCommitUrl: latestCommit?.html_url ?? null,
    fetchedAt: new Date(),
  };
}

export async function fetchGitHubTree(
  owner: string,
  name: string,
  branch: string,
  token = process.env.GITHUB_TOKEN,
) {
  const response = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  const tree = githubTreeSchema.parse(await response.json());
  const files: GitHubTreeEntry[] = tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({
      path: entry.path,
      size: entry.size ?? null,
      sha: entry.sha,
    }));

  return {
    files: files.slice(0, 2000),
    truncated: Boolean(tree.truncated) || files.length > 2000,
    total: files.length,
  };
}

export async function fetchGitHubFile(
  owner: string,
  name: string,
  filePath: string,
  branch: string,
  token = process.env.GITHUB_TOKEN,
) {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const response = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(normalizedPath)}?ref=${encodeURIComponent(branch)}`,
    token,
  );
  const content = githubContentSchema.parse(await response.json());
  if (content.size > GITHUB_CONTENTS_MAX_BYTES) {
    throw new AppError("GitHub Contents API 单文件限制为 20 MB", 413);
  }
  const data = Buffer.from(content.content.replace(/\s/g, ""), "base64");
  return {
    path: content.path,
    name: content.name,
    sha: content.sha,
    size: content.size,
    data,
  };
}

export async function uploadGitHubFile(
  owner: string,
  name: string,
  filePath: string,
  data: Buffer,
  input: {
    branch: string;
    message: string;
    token?: string;
  },
) {
  if (data.length > GITHUB_CONTENTS_MAX_BYTES) {
    throw new AppError("GitHub Contents API 单文件限制为 20 MB", 413);
  }

  const normalizedPath = normalizeRepositoryPath(filePath);
  const token = input.token ?? process.env.GITHUB_TOKEN;
  let sha: string | undefined;

  try {
    const existing = await githubFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(normalizedPath)}?ref=${encodeURIComponent(input.branch)}`,
      token,
    );
    const content = githubContentSchema.parse(await existing.json());
    sha = content.sha;
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode !== 404) {
      throw error;
    }
  }

  const response = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodePath(normalizedPath)}`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({
        message: input.message,
        content: data.toString("base64"),
        branch: input.branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );
  const result = githubWriteSchema.parse(await response.json());
  return {
    path: normalizedPath,
    commitSha: result.commit.sha,
    commitUrl: result.commit.html_url,
  };
}

async function githubFetch(
  path: string,
  token?: string,
  init: {
    method?: string;
    body?: string;
  } = {},
) {
  const response = await githubFetchRequest(
    `${GITHUB_API_URL}${path}`,
    token,
    init,
  );
  return parseGithubResponse(response);
}

async function githubFetchRequest(
  url: string,
  token: string | undefined,
  init: {
    method?: string;
    body?: string;
  },
) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AgileCampus",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  if (init.body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    return await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      throw new AppError("无法验证 GitHub 的 HTTPS 证书，请使用系统 CA 或检查代理配置");
    }
    throw new AppError("无法连接 GitHub，请检查网络或代理配置", 502);
  }
}

function parseGithubResponse(response: Response) {
  if (response.ok) return response;

  if (response.status === 401) {
    throw new AppError("GITHUB_TOKEN 无效或已过期", 401);
  }
  if (response.status === 403 || response.status === 429) {
    if (response.headers.get("x-ratelimit-remaining") === "0") {
      throw new AppError("GitHub API 配额已用尽，请配置 GITHUB_TOKEN 后重试", 429);
    }
    throw new AppError("GitHub 暂时拒绝请求，请稍后重试", response.status);
  }
  if (response.status === 404) {
    throw new AppError(
      "仓库不存在、不是公开仓库，或当前 GITHUB_TOKEN 无权访问",
      404,
    );
  }
  if (response.status === 409) {
    throw new AppError("仓库为空，尚未产生提交", 409);
  }

  throw new AppError(`GitHub 请求失败（${response.status}）`, response.status);
}

function normalizeRepositoryPath(input: string) {
  const path = input.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!path) throw new AppError("请输入仓库内的文件路径");
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new AppError("仓库文件路径无效");
  }
  return path;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}
