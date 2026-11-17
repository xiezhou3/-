# AgileCampus 敏捷校园

面向高校实验室 / 教学团队的 **Agent 驱动轻量项目管理平台**。看板协作、AI 项目助手、资源占用登记、时间线甘特，并支持 Claude Code 等外部程序经 Personal API Token 直接写入。

## 功能特性

- **团队与角色**：创建/加入团队，admin / teacher / student 三级权限
- **平台内成员邀请**：管理员按邮箱添加成员，受邀人登录后在消息中心接受或拒绝；邀请 30 天有效
- **项目文件与代码资料**：支持 PPT、文档、代码、视频、音频分类，本地文件流式上传、仓库链接、Range 预览与权限删除
- **整文件查看页**：视频/音频/PDF 直接播放，PPT/Word 由 LibreOffice 首次转为 PDF 并缓存
- **项目评论区**：项目底部平铺评论、一级回复、作者编辑/删除、管理员删除与历史分页
- **看板内新建任务**：状态列加号打开完整任务弹窗，创建后直接插入目标列
- **固定高度看板**：各列等高，可视区最多容纳三条标准任务，超出后在列内滚动
- **项目看板**：里程碑 + 拖拽看板 + 任务增强（描述/完成情况/起止日/后置任务）+ 标签筛选与四维度分组（状态/指派人/优先级/里程碑，各分组下拖拽皆生效）
- **Sprint 迭代管理**：创建/启动/关闭迭代、迭代目标与起止日期、故事点容量、Backlog 规划、未完成任务退回或顺延
- **Backlog 双栏规划**：产品待办池、行内快速创建、拖拽排序、Backlog/Sprint 跨栏移动与顺序持久化
- **工作项体系**：Epic / Story / Task / Bug 四类工作项、标准三层父子关系、类型筛选与类型分组
- **可配置工作流**：项目级状态、看板列顺序、WIP 上限、状态流转矩阵与任务批量修改
- **项目规划工作台**：项目周期、里程碑、Story Point、预估/实际工时、成员容量、Release 与只读路线图
- **统一项目导航**：桌面固定左侧栏、移动端横向项目导航，集中进入看板、迭代、规划、集成、自动化与配置
- **研发集成中心**：GitHub/GitLab、CI/CD、通用 Webhook、外部事件、任务开发活动与 Release 交付看板
- **自动化模块中心**：常用模板、自定义规则、任务/Release/外部事件触发、站内通知、创建 Bug 与推进状态
- **发布与缺陷闭环**：Release Notes、发布检查清单、Bug 四档严重程度与现有工作流验证
- **任务协作**：任务评论、@成员、评论附件、编辑/软删除、任务关注、站内消息与飞书通知
- **个人工作台**：`/workbench` 聚合我的任务、今日待办、逾期任务、待审核、最近活动与项目负载
- **搜索与视图**：全局搜索任务/项目/团队/Release、项目内任务编号、常用筛选、保存视图与最近访问
- **跨项目总览**：`/projects` 聚合我所在全部团队的项目与任务进度
- **AI 项目助手**：对话式拆解任务，两段式确认后落库（读工具 + 四写兵器草案）
- **资源占用登记**：团队共享资源（服务器/算力等）的占用登记与时长汇总，纯登记无审批
- **Personal API Token**：生成/撤销令牌，供外部程序以本人身份写入
- **Agent 写入 API**：Claude Code 等携令牌直接添加任务、填写完成情况、登记资源占用
- **时间线甘特**：项目内任务按里程碑分组的甘特视图，逾期标红、今日竖线

## 技术栈

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · PostgreSQL 16 + Drizzle ORM · Auth.js v5 (JWT) · Vercel AI SDK v5 (DeepSeek / openai-compatible) · Tailwind CSS v4 · Vitest

## 本地启动

```bash
docker compose up -d          # 启动 Postgres（首次自动建 dev 与 test 两库）
cp .env.example .env          # 填入 AUTH_SECRET（openssl rand -base64 32）与 DATABASE_URL
npm install
npm run db:push               # 推送 schema 到开发库
npm run db:push:test          # 推送 schema 到测试库
npm run dev
```

> Windows 用户可直接双击项目根目录的 `启动网站.cmd`：它会启动 Docker/PostgreSQL、同步数据库结构、启动开发服务器，并打开 `http://localhost:3000`。

> 项目文件默认写入 `D:\agilecampus\storage`；可通过 `.env` 的
> `FILE_STORAGE_ROOT` 修改，单文件上限由 `MAX_FILE_SIZE_BYTES` 控制。
> PPT/Word 在线预览需要 LibreOffice；可通过 `LIBREOFFICE_PATH` 指定 `soffice`。

> `scripts/init-test-db.sql` 仅在 Postgres 数据卷**首次初始化**时执行。若改过 init 脚本或测试库缺失，需 `docker compose down -v` 重建数据卷再 `up`（会清空本地开发数据）。
> 本机若用 colima 提供 Docker：先 `colima start`。

测试：`npm test`

## 生产部署（一键全栈）

`docker-compose.prod.yml` 编排 `db` + `migrate`（自动建表）+ `app` 三服务，同网络起，无需手动推 schema。

```bash
cp .env.example .env
# 填齐生产密钥：
#   AUTH_SECRET=$(openssl rand -base64 32)
#   POSTGRES_PASSWORD=<强密码>          # db 密码，compose 变量插值单一来源
#   AGILECAMPUS_URL=https://<对外域名>   # 飞书 OAuth 回调据此拼跳转
#   DEEPSEEK_API_KEY / FEISHU_APP_ID / FEISHU_APP_SECRET=<真值>
#   FEISHU_REDIRECT_URI=https://<对外域名>/api/auth/feishu/callback
#   CRON_SECRET=$(openssl rand -hex 32)
nano .env

docker compose -f docker-compose.prod.yml up -d --build
```

`migrate` 服务待 `db` healthcheck 通过后跑 `db:push` 建表，成功退出后 `app` 方启动。`app` 内 `DATABASE_URL` 由 compose 指向服务名 `db`，覆盖 `.env` 的 localhost 值（无需改 `.env`）。

**定时提醒**（临期/逾期私信）须由宿主 crontab 每日打一次 cron 端点：

```bash
( crontab -l 2>/dev/null; \
  echo '0 9 * * * curl -fsS -X POST http://localhost:3000/api/cron/reminders -H "Authorization: Bearer <CRON_SECRET>" >/dev/null 2>&1' \
) | crontab -
```

> NAS 部署：本机 `rsync -az --delete --exclude node_modules --exclude .next --exclude .git ./ root@<nas>:/volume1/docker/agilecampus/`，再 ssh 上去于该目录执行上述 `up` 命令。
> 飞书应用后台须将 `FEISHU_REDIRECT_URI` 加入重定向白名单，绑定方能成。

## 主要路由

| 路由 | 说明 |
|---|---|
| `/teams` | 我的团队（创建/加入） |
| `/teams/[teamId]/members` | 成员管理（admin 改角色） |
| `/invitations` | 平台内团队邀请（接受 / 拒绝） |
| `/teams/[teamId]/projects` | 项目列表（admin 创建） |
| `/teams/[teamId]/resources` | 资源占用登记 + 时长统计 |
| `/teams/[teamId]/labels` | 团队标签管理（admin 增删改，成员只读） |
| `/workbench` | 个人工作台（我的任务、今日事项、逾期、审核、活动与个人视图） |
| `/search` | 全局搜索（任务编号、任务、项目、团队与 Release） |
| `/projects` | 所有项目总览（跨团队聚合 + 任务统计） |
| `/projects/[projectId]` | 项目详情：里程碑 + 看板 + 任务 + AI 助手 |
| `/projects/[projectId]/backlog` | 产品 Backlog 与 Sprint Backlog 双栏规划 |
| `/projects/[projectId]/sprints` | Sprint 迭代规划与管理 |
| `/projects/[projectId]/planning` | 项目规划工作台（工时、容量、Release、路线图） |
| `/projects/[projectId]/integrations` | 集成中心（代码仓库、CI/CD、Webhook 与外部事件） |
| `/projects/[projectId]/automations` | 自动化规则、模板、启停与执行日志 |
| `/projects/[projectId]/releases/[releaseId]` | Release 交付看板（PR、流水线、部署与发布状态） |
| `/projects/[projectId]/workflow` | 工作流状态、WIP、列排序与流转规则 |
| `/projects/[projectId]/files` | 项目文件库（真实元数据与本地文件存储） |
| `/projects/[projectId]/timeline` | 项目时间线甘特 |
| `/settings/tokens` | 个人访问令牌（生成/撤销） |

---

## Agent 写入 API

供 Claude Code 等浏览器之外的程序，以用户身份写入 AgileCampus。

### 认证

所有 `/api/agent/*` 端点用 **Personal API Token** 认证（区别于浏览器 session）：

```
Authorization: Bearer <token>
```

在网页「设置 → 个人访问令牌」生成，明文只显示一次；库中仅存 sha256 hash。令牌权限等同本人：只能操作有权限的团队/项目，越权返回 `403`。约定两个环境变量：

- `AGILECAMPUS_URL` — 站点地址，如 `http://localhost:3000`
- `AGILECAMPUS_TOKEN` — 令牌明文

### `POST /api/agent/tasks` — 新建任务

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `projectId` | uuid | 是 | 目标项目 |
| `title` | string | 是 | 任务标题 |
| `workItemType` | `epic`\|`story`\|`task`\|`bug` | 否 | 工作项类型，默认 `task` |
| `parentWorkItemId` | uuid | 否 | 上级工作项；Story 须挂 Epic，Task/Bug 须挂 Story |
| `description` | string | 否 | 描述 |
| `assigneeId` | uuid | 否 | 负责人（须为团队成员） |
| `startDate` | string | 否 | 起始日 `YYYY-MM-DD`（供时间线排期） |
| `dueDate` | string | 否 | 截止日 `YYYY-MM-DD` |
| `milestoneId` | uuid | 否 | 里程碑（须属该项目） |
| `releaseId` | uuid | 否 | 所属版本 / Release（须属该项目） |
| `priority` | `low`\|`medium`\|`high` | 否 | 默认 `medium` |
| `estimate` | integer | 否 | Story Point，非负整数 |
| `estimatedHours` | number | 否 | 预估工时（小时），非负数 |

```bash
curl -X POST "$AGILECAMPUS_URL/api/agent/tasks" \
  -H "Authorization: Bearer $AGILECAMPUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<uuid>","title":"撰写调研问卷","startDate":"2026-07-01","dueDate":"2026-07-08","priority":"high"}'
# → { "id": "...", "title": "撰写调研问卷", "status": "todo" }
```

### `POST /api/agent/tasks/complete` — 填写完成情况

将任务标记为 `done` 并附完成说明。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `taskId` | uuid | 是 | 目标任务 |
| `completionNote` | string | 是 | 完成说明 |

```bash
curl -X POST "$AGILECAMPUS_URL/api/agent/tasks/complete" \
  -H "Authorization: Bearer $AGILECAMPUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"<uuid>","completionNote":"已跑通全部演武"}'
# → { "id": "...", "status": "done" }
```

### `POST /api/agent/resource-usage` — 登记资源占用

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `teamId` | uuid | 是 | 目标团队 |
| `resourceName` | string | 是 | 资源名，如 `GPU-01` |
| `purpose` | string | 否 | 用途 |
| `startTime` | ISO 8601 | 是 | 开始时间，如 `2026-07-22T14:00:00Z` |
| `endTime` | ISO 8601 | 否 | 结束时间；省略 = 占用中 |

```bash
curl -X POST "$AGILECAMPUS_URL/api/agent/resource-usage" \
  -H "Authorization: Bearer $AGILECAMPUS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"<uuid>","resourceName":"GPU-01","purpose":"训练模型","startTime":"2026-07-22T14:00:00Z"}'
# → { "id": "...", "resourceName": "GPU-01", "active": true }
```

### 响应与错误

| 状态 | 含义 |
|---|---|
| `200` | 成功，返回创建/更新后的精简对象（含 `id`） |
| `400` | 请求格式无效（缺字段、类型错、时间非法） |
| `401` | 令牌缺失、畸形、伪造或已撤销 |
| `403` | 越权——令牌主人对目标项目/团队无权限 |
| `500` | 服务器错误，可重试 |

### 安全说明

- 令牌库中只存 sha256 hash，明文只在生成时返回一次，泄露即在设置页撤销。
- 外部写入一律不被信任：`token → userId → lib 权限校验`，越权由业务层拒绝。

### Claude Code 集成

项目内置 `.claude/skills/agilecampus/` skill，封装上述端点调用——配置好 `AGILECAMPUS_TOKEN` 与 `AGILECAMPUS_URL` 后，即可在 Claude Code 里用自然语言「给项目 X 加任务 Y」「把任务 Z 标记完成」「登记我占用了 GPU-01」。完整契约另见 [`docs/agent-api.md`](docs/agent-api.md)。

---

## 文档

- 设计与作战图：`docs/superpowers/`
- Agent 写入 API：`docs/agent-api.md`
- 研发集成 Webhook：`docs/integrations.md`
- 技术债备案：`docs/BACKLOG.md`
