# 技术债备案（作战图一审查沉淀）

内部试用可接受、市场化/正式上线前须重审的取舍：

## 安全/认证
- JWT 会话无显式失效机制，默认 30 天 maxAge——改密码后旧 token 仍有效；正式上线前设短 maxAge 或引入会话版本号
- authorize 对不存在用户不跑 bcrypt（时序侧信道可枚举邮箱）——如需弭平，对不存在用户跑固定 hash 的 compare 占位
- 最后一名 admin 可被降级/自降导致团队无管理员——lib 层补"末位 admin 不可降级"不变量
- 成员管理页对全体成员展示所有人邮箱——确认隐私合规或限 admin 可见

## 产品
- 邀请码 nanoid(10) 混大小写含 -/_，口头/板书传播不友好——可换大写字母+数字自定义字母表（去 0/O/1/I/L）
- 邀请码对全体成员明文展示——考虑仅 admin 可见
- createTeam 邀请码唯一键碰撞（概率 64^-10）无重试兜底

## 工程
- docker-compose 硬编码凭证与 .env 双源无关联机制——改 env_file/变量插值统一来源
- docker-compose 无 healthcheck——引入 depends_on 服务前补
- 团队列表查询直写在 page.tsx——再有同类需求时上提 lib 层 listMyTeams
- bcryptjs 自带类型声明，@types/bcryptjs 冗余可移除
- SALT_ROUNDS=10 为下限，可评估升 12

## 图二（骨架）简化备案
- 无项目级成员表：团队成员即可见全部团队项目（"参与的项目"从宽）
- 看板列内手动排序未做（sort_order 已建，拖拽仅改状态）
- teacher 反馈/评论功能后置（设计文档原定 MVP 后）
- 里程碑无编辑/关闭入口（仅创建与展示，状态字段已建）
- 项目无编辑/归档入口（status 字段已建）
- updateTask/deleteTask "任务不存在"先于权限返回，对非成员泄露 uuid 存在性（uuid 不可枚举，风险极低）

## 图三上（对话地基）简化备案
- 对话采请求-响应式（generateText 非流式），真流式（useChat + toUIMessageStreamResponse）后置——无密钥时流式无从离线验证
- 每项目一活跃会话（getOrCreateConversation 取最近一条），未做多会话/会话列表
- tool role 消息未独立成行：工具轨迹并入 assistant 消息的 toolCalls jsonb
- DeepSeek 真实调用未演武（离线打通策），密钥齐备后须补真实一轮问答验收
- 快照上限固定 2000 字符、超限整体降级为统计头，未做分段精细裁剪
- 工具执行走底层 lib 各自的权限校验，与编排入口 getProjectForUser 构成轻微重复查询（复用现成 lib，未优化）

## 依赖版本教训（图三上 Task 6 沉淀）
- **AI SDK provider spec 版本须对齐**：`ai@5` 依赖 `@ai-sdk/provider@2`（LanguageModelV2），`generateText` 按 `specificationVersion === "v2"` 分派；`@ai-sdk/openai-compatible@3` 却依赖 provider@4（V4），既过不了 tsc，生产 getModel 亦运行时不匹配。正解锁 `@ai-sdk/openai-compatible@^1.0.46`（依赖 provider@2），使全树 provider dedupe 至单一 2.0.3。日后若升 `ai` 至 v6/provider V4，openai-compatible 须同步回 @3。
- `ai/test` 的 `MockLanguageModelV2` 数组形式 `doGenerate: [...]` 在 5.0.218 下按 `doGenerateCalls.length`（push 后）取值，等效 1-indexed 跳过 [0]；多轮 replay 须用函数游标形式 `doGenerate: async () => script[cursor++]`。
- `ai/test` 静态 import `msw`（provider-utils 的声明依赖但未随装），须显式补 `msw` devDependency 方可离线用 mock。

## 图三下（四写兵器）简化备案
- plan_sprint 免版本校验（草案仅 taskIds 无逐任务 updatedAt）——批量归里程碑+设截止日，低冲突，MVP 可接受
- update_tasks 乐观锁比对 updatedAt.toISOString()；同一毫秒两写理论上仍可能漏检，概率极低
- update_tasks 同批次若含同一任务两条变更，versionOf 为循环前快照，第二条仍可能通过（边缘场景，MVP 不处理）
- 草案不入库持久化：仅随 assistant 消息 toolCalls 留痕 + 前端态；页面刷新后未落库的草案卡片消失（需重新对话）
- 确认卡片可编辑聚焦核心字段：update_tasks 卡仅展示 patch（不可逐字段改）
- DeepSeek 真实「拆任务→确认→落库」演武待密钥
- ~~**批量落库非事务**（总审沉淀）：commitDraft 的 decompose/update/plan_sprint 循环无 db.transaction，中途第 k 项抛错则前 k 项已落库、请求返错、用户重试致重复；市场化前须事务化（须图二 createTask/updateTask 接受 tx 参数）~~ **[已偿·图七]** createTask/updateTask 收 tx，三分支裹 db.transaction，通知事务提交后补发
- update_tasks 中不属本项目的 taskId 被误报为"版本冲突/他人改动"（实为无效 id）——纯提示文案，无安全影响

## 图四（任务增强+总览）简化备案
- 后置任务仅防直接成环（A↔B），未做间接环（A→B→C→A）检测——简单关联，不强制阻断执行
- 完成情况(completionNote)仅编辑态填写，未做「拖入已完成时弹窗提示补充」的引导交互
- 跨项目总览为列表+任务统计，未含管理员整体看板泳道/甘特图（留后续「图五·管理视图」）
- listMyProjects 对 admin/teacher/student 一视同仁（无项目级成员表，沿图二备案）
- 后置任务多选下拉在任务多时体验一般（原生 select multiple），未做更友好的选择器

## 图五（API Token + 资源占用 + CC 写入）简化备案
- token 作用域=该用户全部权限（MVP），未做限定项目的细粒度作用域（留后续）
- token 无过期机制，仅撤销即失效；未做自动过期/轮换
- verifyApiToken 每次校验命中即写 lastUsedAt（每请求一次写），未做节流/批量
- listApiTokens 含已撤销令牌供 UI 标注状态，撤销记录不清理会累积（无软删清理任务）
- 资源名自由填写，无预定义资源池/资源实体表——同名字符串即同一资源（大小写/空格敏感）
- 时长汇总仅计已结束占用；进行中占用不计入 byUser/byResource（避免 now 引入的不确定性）
- endResourceUsage 权限=登记者本人 or 团队 admin；teacher/其他成员不可结束他人占用
- /api/agent/* 无速率限制，防滥用（限流）后置
- resource-usage 端点时间用 z.coerce.date()，时区取决于调用方传入的 ISO 串；网页表单用 datetime-local（本地墙钟）
- ~~CC 仅「写入」（加任务/填完成/登记资源），未做「读」端点（查进度/列任务）——陛下所命~~ **[已偿·图八]** 补五道读端点：`GET /projects`、`GET /projects/{id}`、`GET /projects/{id}/tasks`、`GET /tasks/{id}`、`GET /tasks/{id}/subtasks`
- CC skill 需用户手动配置 AGILECAMPUS_TOKEN/AGILECAMPUS_URL 环境变量；skill 未自动发现 project/team 的 uuid（需用户提供或从地址栏取）
- 尚未攻取：C 实验时间线视图、E 飞书接入（须陛下先备飞书 AppID/Secret）

## 图六·C（实验时间线甘特）简化备案
- 任务加 startDate（可空 date）；时间线取 [startDate?, dueDate?]：仅一端有值时以该端为准，单日任务补 1 天宽度
- 甘特纯 server 端渲染 + CSS 百分比定位，无缩放/拖拽/横向滚动（长跨度项目条会很细）——只读查勘视图
- 时间范围强制纳入「今日」，全部任务在远期时图会被今日拉长（现实数据近期，可接受）
- 逾期判定=status≠done 且 dueDate<今日；未设 dueDate 的任务不判逾期
- 里程碑分组按 listProjectMilestones 顺序 + 末尾「无里程碑」；未排期任务单列徽章展示，不入甘特
- 时间线为项目级；跨项目/团队总甘特未做（留后续管理视图）
- startDate 未校验 ≤ dueDate（前端可倒填）；甘特对 start>end 做防御性纠正，但 lib 未强约束
- 时间线视图只读，未做在甘特上直接拖拽改期

## 图七（飞书接入）简化备案
- cron 端点无「当日已发」去重——逾期任务每日一提醒，靠外部调度每日一击天然节流；同日重跑会重复发
- 日报仅按 assignee 聚合；未指派的临期/逾期任务无人可提醒（不发）
- 完成通知仅发创建者一人；admin/teacher 全局视角后置
- 飞书消息用纯文本，未做交互卡片（含「查看任务」跳转按钮）——富卡片后置
- OAuth `state` 存 cookie 即可，未引入服务端 state 存储/一次性消费
- token 缓存为进程内存——多实例各自缓存（各自换取，飞书侧允许）；未做共享缓存
- 未做飞书事件订阅（用户在飞书内退订/停用应用的回调）——绑定后飞书号失效时发送失败仅记日志
- `scanAndNotifyDue` 全库扫描——任务量大时未分页/分批；当前规模可接受
- update_tasks 批量确认仅补发完成通知，未补发改派通知（改派走网页/CC 即时路径）
- 真机飞书 OAuth 绑定验收（Task 6）须备妥凭证亲验，离线不可代

## 图八（AI 修复 + 项目管理 API + 子任务）简化备案

### 本役沉淀（教训）
- **DeepSeek 番号已改制**：`deepseek-chat` 遭废弃，今只认 `deepseek-v4-pro` / `deepseek-v4-flash`，误用返 400 `invalid_request_error`。此即「对话失败，请重试」500 之真因（APICallError 非 AppError，落入通用分支）。现取 `DEEPSEEK_MODEL` 环境变量，缺省 `deepseek-v4-flash`。**日后模型番号务必置于配置，勿硬编码。**
- **快照缺 id 则写工具形同虚设**：旧快照只给成员名与里程碑标题，不给 uuid，模型遂无从填 `assigneeId`/`milestoneId`，指派与排期必空。今补 `id=` 于成员/里程碑/任务三段，并补「今天是 YYYY-MM-DD」——缺此则相对日期（「下周五」）必错。
- **模型会「演」草案而不调工具**：DeepSeek 曾口称「已拟好变更草案」而 `drafts` 实为空，界面一片空白。prompt 须显式声明「只有真正调用工具才会生成草案卡片，你写的文字不会变成草案」方止此弊。
- **模型过度盘问亦是缺陷**：仅告以「信息不足先问清楚」，模型对「帮我建个完成ai的任务」一味追问。须以实例立法（示以具体输入与应有动作）方肯动手。prompt 中一则范例胜过三条抽象规矩。

### 简化取舍
- 子任务仅一层语义（`parent_task_id` 自引用），API 只列**直接子级**不递归；深层树形与「展开全部子孙」后置
- **既有看板/甘特/统计视图未识子任务**——子任务作为普通任务平铺显示，父任务统计不含子任务汇总。UI 层级呈现留待陛下定夺
- `updateTask` 未开放改 `parentTaskId`（故无成环之虞，亦无须环检测）；如日后开放，须补环检测
- AI 写工具（`decompose_tasks`）未支持 `parentTaskId`——AI 拆出的任务一律为顶层
- `POST /api/agent/tasks`（body 传 projectId）与 `POST /api/agent/projects/{id}/tasks`（路径传）并存，功能重叠；保留旧约以免折损在用之 skill
- `create_milestone` 落库需 admin（沿 `createMilestone` 口径），student 拟出草案却点不动「确认落库」——提示文案未作角色预判
- `GET /projects/{id}/tasks` 之筛选在应用层做（取全量再 filter），未下推 SQL；当前规模可接受
- `getTaskDetail`/`listSubtasks` 沿旧口径，「任务不存在」先于权限返回（uuid 不可枚举，风险极低）
- 真实模型演武置于 `tests/agent-live.test.ts`，以 `describe.skipIf(!process.env.DEEPSEEK_API_KEY)` 自守——`.env.test` 无此变量，故 `npm test` 自动跳过、不耗额度。真打跑法：
  `export DEEPSEEK_API_KEY=sk-xxx && npx dotenv -e .env.test -- npx vitest run tests/agent-live.test.ts`
  （注：vitest 4 已无 `--include` 旗号，勿用）
- `tests/agent-drafts.test.ts` 在全量并行下偶发 5s 超时（单跑 852ms 即捷）——共享测试库之粮道拥塞，未调 `testTimeout`

## 图九（Sprint 迭代管理）简化备案
- 同一项目最多一个 active Sprint，由数据库部分唯一索引兜底；planned Sprint 日期允许重叠
- Sprint 容量以故事点计量；任务未估算时允许进入 Sprint，只单列提示，不做硬性拦截
- 容量超标仅显示警告，不阻止任务规划或启动
- 关闭 Sprint 时，已完成任务保留历史归属；未完成任务由用户选择退回 Backlog 或顺延到某个 planned Sprint
- 已关闭 Sprint 只读，其中的任务不能再次重新规划
- 本期不做 Sprint 删除、自动滚动、燃尽图、速度图与容量按成员拆分

## 图十（Backlog 双栏规划）简化备案
- Backlog 使用独立 `backlogRank`，不复用看板 `sortOrder`
- 拖拽保存时按当前双栏完整顺序重排受影响任务，步长固定 1024
- Backlog 页面一次只管理一个选中 Sprint；跨 Sprint 移动需切换选择器
- 行内快速创建只填写标题，其余字段进入现有任务详情补充
- 已关闭 Sprint 历史任务不显示在 Backlog 工作区
- 本期不做 Backlog 搜索、批量选择、Epic 分组与跨项目 Backlog

## 图十一（工作项类型体系）简化备案
- 工作项类型使用单枚举：Epic / Story / Task / Bug；既有数据默认 Task
- `parentTaskId` 继续表示旧子任务能力；新增 `parentWorkItemId` 专管标准工作项层级
- Story 可无 Epic，Task/Bug 可无 Story；一旦设置父项则必须符合三层规则
- 删除 Epic/Story 时下级保留并解除父项，不级联删除
- 本期不做 Epic 路线图、自定义类型、验收标准和跨项目父子关联

## 图十二（可配置工作流）简化备案
- 任务保留旧 `status` 类别字段作为统计缓存；新增 `statusId` 指向项目级可配置状态
- 每个项目自动维护 todo/doing/done 至少各一个状态；默认状态不可删除
- WIP 上限按状态统计并允许管理员留空；超额时阻止状态变更和批量迁移
- 状态流转采用显式矩阵；新建状态默认与全部现有状态双向连通，由管理员再收紧
- 看板列顺序由状态 `position` 决定，当前使用上/下移按钮而非拖拽排序
- 批量操作支持修改状态、优先级和负责人；批量状态变更逐项在同一事务中校验流转与 WIP
- 本期不做按角色限制流转、自动转状态、状态进入/离开钩子和跨项目共享工作流

## 图十三（任务评论与关注）简化备案
- 任务评论嵌入任务详情，不新增独立聊天模块
- 评论回复只做一级线程；回复二级评论时归入同一根评论
- @提及使用成员选择器产生的 mentionIds，不依赖纯文本解析
- 评论作者、被提及者和被回复者自动关注任务；也可手动关注/取消
- 评论支持项目文件附件；编辑仅改正文，附件维持创建时状态
- 软删除保留评论记录与线程结构，删除内容不再计入任务卡评论数和提及状态
- 关注者会在任务评论和状态变化时收到站内消息与飞书通知
- 本期不做评论富文本、表情回应、实时在线状态和独立任务聊天室

## 图十四（个人工作台）简化备案
- 登录后默认进入 `/workbench`；工作台复用既有任务、审核、通知与成员数据，不新增表
- “我的任务”只聚合分配给我且未完成的任务，个人负载按项目汇总待办、进行中、逾期和故事点
- “今日待办”按 Asia/Shanghai 当日日期判定；“逾期任务”为截止日早于今日且未完成任务
- “待审核”同时展示项目管理员待处理队列与我提交后等待确认的任务，去重后计入概览
- 最近活动取当前用户站内通知，最多展示 10 条；团队邀请仍在消息中心处理
- 本期不做跨项目内联编辑、工作台自定义卡片、拖拽排序、日/周切换和历史趋势导出

## 图十五（项目规划工作台）简化备案
- 规划工作台复用现有项目日期、里程碑、任务故事点与 Sprint 数据，不重做既有迭代能力
- `tasks.estimate` 继续表示 Story Point；新增 `estimatedHours`，两者独立统计、不可互相换算
- 实际工时使用 `task_work_logs` 明细记录，按任务聚合；单条工时不超过 24 小时，且不允许未来日期
- 成员容量按 `Sprint + 成员 + 可用小时` 保存；现有 `sprints.capacity` 仍表示 Story Point 容量
- Release 为项目级实体，任务可关联一个 Release；删除 Release 时任务保留并自动解除关联
- 路线图只读，展示 Release、带日期的 Epic 和开放里程碑；本期不做拖拽排期、依赖连线和缩放
- 报表联动展示预估/实际工时偏差与 Release 完成进度；暂不做人员级工时成本、节假日日历和延期预测
- Release 与成员容量由项目管理员/学生维护，教师只读；工时记录由管理员/学生新增，本人或管理员可删除

## 图十六（搜索与视图）简化备案
- 任务编号为项目内单调递增整数，如 `#23`；已有任务首次访问/搜索时自动回填，删除任务后编号不复用
- 全局搜索覆盖当前用户有权访问的任务、项目、团队和 Release；纯数字或 `#数字` 会同时按任务编号精确匹配
- 搜索使用数据库 `ilike`，暂未引入全文索引、拼音、模糊纠错或跨租户搜索
- 常用视图为内置快捷筛选：全部任务、分配给我、高优先级、逾期任务、未指派
- 保存视图仅作用于项目看板，每个用户每项目最多 20 个，保存当前 URL 筛选条件并可删除
- 最近访问记录项目页与任务深链，按用户和路径去重更新；工作台与搜索页显示最近记录
- 本期不做保存视图排序/共享、搜索历史、跨项目组合视图与实时搜索联想

## 图十七（研发集成中心）简化备案
- 首期不接 OAuth；GitHub/GitLab 由管理员或学生手工填写仓库地址并复制 Webhook URL
- Webhook Key 直接作为路径凭据，支持轮换后旧地址立即失效；暂未做 HMAC 签名、IP 白名单与重放防护
- GitHub 支持 PR、Push、Actions Workflow 与 Deployment Status 的基础字段解析；GitLab 支持 MR、Pipeline 与 Deployment
- CI/CD 与任意系统统一使用通用 JSON Webhook，暂不内建流水线 Runner
- 事件通过标题、分支、提交说明中的 `#数字`、`task-数字` 关联任务，通过 `releaseId`、`releaseName` 或任务所属 Release 关联版本
- 任务详情展示最近 20 条关联开发活动；Release 交付看板展示代码、构建、部署、发布四段状态和最近事件
- Webhook 请求上限 1 MB；暂未做事件去重、失败重投、事件筛选器和外部系统状态反向同步
- 本期只展示外部事件，不自动修改任务/Release 状态；后续自动化规则可复用同一事件表触发动作
- Release 交付看板根据已完成任务自动生成 Release Notes，并检查未完成任务、阻断级 Bug、流水线、部署和正式发布状态
- Bug 增加 `blocker/critical/major/minor` 四档严重程度；生命周期继续复用项目可配置工作流与现有审核流，不另造状态机
- 本期不实现测试用例库、测试计划、缺陷独立状态机和部署执行；轻量测试记录留待后续按实际使用频率决定

## 图十八（自动化模块中心）简化备案
- 首期触发器仅三类：任务状态变化、外部集成事件、Release 状态变化
- 动作仅三类：发送站内通知、创建 Bug、按状态类别推进关联任务
- 内置四个模板：CI 失败创建 Bug、Release 发布通知、PR 合并推进任务、高优先级任务完成通知
- 支持自定义名称、触发条件、任务类型/优先级/状态过滤、动作参数和简单标题/说明模板
- 每次执行写入 `automation_runs`，记录成功、跳过或失败原因；通知接收人支持管理员、负责人、关注者和规则创建者
- 自动化动作内部使用递归深度保护，避免“推进状态”再次触发同类规则形成循环
- 本期不做 Cron/定时触发、出站 Webhook、脚本执行、多步骤动作、分支条件和跨项目规则

## 图十九（项目统一导航）简化备案
- 项目路由增加共享 `layout`，所有项目子页面共用项目上下文、团队名、角色、周期与状态
- 桌面端采用 15rem 左侧固定导航，按工作、交付、配置三组组织项目内功能
- 移动端不保留固定侧栏，改为项目标题 + 可横向滚动的项目功能导航
- 项目看板首页移除九个横向入口按钮；Backlog、迭代、规划、文件、集成、自动化、时间线、报表、工作流等页面移除重复“返回项目”链接
- Release 详情与文件预览仍保留子资源返回路径，避免无法回到来源列表
- 本期不做侧栏折叠、拖拽排序、自定义导航或按角色隐藏页面
