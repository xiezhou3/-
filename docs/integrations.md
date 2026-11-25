# 研发集成 Webhook

集成中心为 GitHub、GitLab、CI/CD 和通用 Webhook 生成独立地址：

```text
POST /api/integrations/webhooks/<webhookKey>
Content-Type: application/json
```

Webhook Key 由集成中心生成，轮换后旧地址立即失效。请求体上限 1 MB。

## 通用事件

```json
{
  "eventType": "pipeline",
  "action": "finished",
  "title": "构建任务 #42",
  "status": "success",
  "url": "https://ci.example.com/build/42",
  "actor": "ci-bot",
  "branch": "feat/#23-global-search",
  "commitSha": "abc123",
  "environment": "staging",
  "taskNumbers": [23],
  "releaseId": "<release-uuid>",
  "releaseName": "v1.0",
  "occurredAt": "2026-11-17T08:00:00Z",
  "message": "可选的补充说明"
}
```

任务还会从标题、说明、分支和 URL 中的以下形式自动提取编号：

- `#23`
- `task-23`
- `task_23`
- `task/23`

Release 按 `releaseId`、`releaseName` 或关联任务所属 Release 匹配。

## GitHub

直接使用 GitHub Webhook，支持的基础事件：

- `pull_request`
- `push`
- `workflow_run`
- `workflow_job`
- `deployment_status`

平台读取 `X-GitHub-Event` 请求头。

## GitLab

直接使用 GitLab Webhook，支持：

- Merge Request Hook
- Pipeline Hook
- Deployment Hook

平台读取 `object_kind` 或 `X-Gitlab-Event`。

## 当前限制

- 暂未校验 GitHub/GitLab 签名，仅依赖私有 Webhook URL。
- 暂未实现事件去重、重放防护和失败重投。
- 外部事件当前只用于展示，不会自动修改任务或 Release 状态。
