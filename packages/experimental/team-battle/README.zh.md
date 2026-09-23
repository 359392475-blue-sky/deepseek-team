---
description: "持久化团队空间、成员绑定邀请、共享服务器协作与私人浏览器 Remote 访问。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-team-battle

[English](README.md) | 中文

## 概述

`dsh-experimental-team-battle` 保留已配置的原有项目，并管理独立存储的托管团队及已加入的服务器连接。`teamBattle` Typert 命名空间按每个请求的 `teamId` 路由；私人 Session 留在各成员设备。共享数据包含明确发布的文件、任务交接、已确认 Context 和独立产物验收。

## 目录

- [配置](#configuration)
- [领域行为](#domain-behavior)
- [Remote API 与更新](#remote-api-and-updates)
- [团队文件空间](#shared-file-space)
- [Query 入口](#query-ingress)
- [持久化与容量](#persistence-and-capacity)
- [共享服务器团队](#shared-server-teams)
- [本地协作演练](#local-collaboration-simulation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="configuration"></a>
## 配置

原有项目身份与 roster 是固定的部署事实。已存状态重开时，如果解析后的配置不同，系统会失败，而不会静默迁移或替换项目。

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `projectId` | 必填 | 稳定项目身份。 |
| `projectName` | 必填 | 项目展示名。 |
| `projectGoal` | 必填 | 共享结果陈述。 |
| `localMemberId` | 必填 | 浏览器变更与本地 Session Query 默认使用的成员。 |
| `allowSimulation` | `false` | 显式允许本地协作演练请求选择已配置成员。 |
| `members` | 必填 | 非空 `{ id, name, role, color? }` roster；color 可选，为六位十六进制值。 |
| `maxTeams` | `16` | 托管及已加入团队的数量上限，不含原有空间。 |
| `maxInvitesPerTeam` | `64` | 每个托管团队保留的邀请数上限。 |
| `membershipLifetimeHours` | `720` | 受邀成员凭证签发后的绝对有效时长；所有者不会自动过期。 |
| `storageLocation` | 未设置 | 运维配置的本机数据路径；远端连接显示服务器 URL。 |
| `maxMembers` | `8` | 保留成员数量上限，含历史成员身份。 |
| `maxFileBytes` | `2097152` | 单个上传文件的实际字节上限。 |
| `maxTotalFileBytes` | `33554432` | 所有保留文件的总字节上限。 |
| `maxSpaceItems` | `512` | 文件夹与文件的总数量上限。 |
| `maxDeliveries` | `512` | 保留的投递记录数量上限。 |
| `maxTasks` | `256` | 保留任务的最大数量。 |
| `maxContextEntries` | `512` | 保留的已确认 Context 条目最大数量。 |
| `maxArtifacts` | `512` | 保留产物元数据记录的最大数量。 |
| `maxActivityEntries` | `512` | 活动保留上限；到达上限时移除最旧行。 |
| `maxProcessedEventIds` | `4096` | Query 事件 id 的精确一次保留槽位；耗尽时明确失败。 |
| `maxWeaponGrants` | `4096` | 保留 Query 武器授予的最大数量；不得超过事件 id 槽位。 |
| `combatShieldMax` | `100` | 可重复的战斗护盾 HP。 |
| `shieldDamagePerQuery` | `2` | 消耗一枚 Query 武器时造成的伤害。 |
| `memberOfflineAfterMs` | `60000` | 非 offline 成员投影为 offline 前的最大状态年龄。 |

所有 id、上限、文本范围、roster 关系、颜色与战斗数值，都会在服务激活或提交 mutation 前完成校验。

<a id="domain-behavior"></a>
## 领域行为

任务使用 `expectedRevision` 比较并更新。任务可以认领、释放、编辑、交接给活跃成员、在已有待审产物时提交、从 `submitted` 重开，或在没有产物时删除。当前任务负责人或团队所有者可使用 `handoff`，传入 `targetMemberId` 和可选 `note`；系统指定接手人并设为 `in_progress`。发布产物元数据要求请求成员拥有该任务，并将任务设为 `submitted`；外部产物字节仍留在所给 URI，不会复制进任务域。

项目进度与核心 HP 只从当前任务权重与已 accepted（验收）的产物评审派生。pending（待审）或 rejected（驳回）产物不造成核心伤害。只要某个关联产物仍被 accepted，其任务就保持 `completed`，包括另一个关联产物后续被 rejected 的情况；作者不能验收自己的产物；其他成员重复相同终态评审返回未变视图。

`publishContext` 只存储明确的结构化更新：摘要、决策、阻塞项、下一步与来源引用。Query 文本绝不会自动变成 Context。presence（在线状态）heartbeat（心跳）会刷新 `lastSeenAt`；有效状态未变的重复心跳不会添加活动行。Query ingress（入口）使用服务端时间把所属成员标记为 online，而 `view()` 无需 timer（定时器）或后台写入就会把过期成员投影为 offline。

每个不同 Query 授予一枚武器。消耗是幂等的，且只伤害战斗护盾，绝不改变项目核心 HP。当处于零的护盾收到下一枚未消耗武器时，先重置为 `combatShieldMax` 再应用本次命中，从而不用 timer 就形成可重复循环。

<a id="remote-api-and-updates"></a>
## Remote API 与更新

所有浏览器方法均为异步。`teamId` 选择托管或已加入空间；省略时访问原有空间。任务域 mutation 返回完整 `TeamBattleView`，文件域 mutation 返回 `TeamBattleSpaceView`；Typert 仍会用标准 transport（传输）`RemoteResult` 包装调用。

| 方法 | 请求 | 结果 |
|---|---|---|
| `teamBattle.view(request?)` | 可选演练身份 | 包含请求成员与 `simulationEnabled` 的当前独立视图。 |
| `teamBattle.createTask(request)` | 标题、描述、权重 | 已提交视图。 |
| `teamBattle.updateTask(request)` | 任务 id、预期 revision、action 与编辑字段 | 已提交视图。 |
| `teamBattle.publishContext(request)` | 已确认结构化 Context | 已提交视图。 |
| `teamBattle.publishArtifact(request)` | 任务关联与产物元数据 | 已提交视图。 |
| `teamBattle.reviewArtifact(request)` | 产物 id、预期 revision、决定、可选备注 | 已提交或已等价视图。 |
| `teamBattle.consumeWeapon(request)` | 武器 id | 已提交或已消耗视图。 |
| `teamBattle.heartbeat(request)` | `online`、`idle` 或 `offline` | 已提交视图。 |

每个任务域持久 mutation 都会以提交后视图发出 Host 事件 `team-battle/changed`。浏览器把轮询 `view()` 作为跨进程更新路径；Host 事件可供同进程消费方使用。

<a id="shared-file-space"></a>
## 团队文件空间

独立且版本化的 `team_battle_space` 存储域保存文件夹、真实文件字节、元数据和投递记录；开启文件空间不会重写已有 `team_battle` 数据。`space()` 只返回元数据，`readFile({ fileId })` 返回 `{ file, contentBase64 }`。`publishFile` 接收规范 base64、文件名、媒体类型、版本标记、备注、来源及可选父文件夹，服务端计算字节数与 SHA-256。用户必须明确发布；私人对话不会自动进入文件空间。客户端负责使用安全的媒体预览方式，不能把上传的 HTML 作为当前应用执行。

`createFolder` 与 `updateSpaceItem` 支持嵌套文件夹、基于 `expectedRevision` 的重命名与删除；同目录重名、非空文件夹、已关联验收或已有投递记录的文件不能删除。文件内容不可覆盖。`submitFile({ fileId, taskId, expectedTaskRevision })` 将文件关联到请求成员已认领的任务，之后复用 `reviewArtifact` 验收；任务域通过内部 URI 引用已保留的字节，文件视图从任务域读取验收状态。两个域共享一个进程内操作队列，避免提交任务与删除文件相互竞态。

仅在原有空间中，`sendFile({ fileId, expectedRevision })` 为请求成员创建 `queued` 投递，同一文件修订的待处理重复请求返回原记录。认证连接器每次通过 `pullDelivery` 读取最早一项，拉取不会改变状态；只有 `acknowledgeDelivery` 会持久化 `delivered` 或 `failed`。`delivered` 是连接器对本地 Codex 接收结果的声明，服务器不独立验证 Codex。投递不更新成员在线状态，内容字节与文件 id 始终保留；文件可以重命名，后续拉取返回当前名称。文件列表与验收页应同时刷新 `space()` 与 `view()`。

<a id="query-ingress"></a>
## Query 入口

原有项目只在 `source.kind` 为 `user` 时观察 `user/message` Session 事件。它使用事件 id `<session.id>:<event.seq>`、已配置的 `localMemberId` 与 Session 事件时间调用同一个公开 `ingest()` 方法。它不读取或保留消息内容。

外部 connector（连接器）使用严格对象 `{ version: 1, type: "query", eventId, memberId, occurredAt }` 调用 `ingest()`。未知字段会被拒绝，因此包含 `prompt`、`query` 或其他文本的 body（请求体）不能跨过此 API。每个已接纳事件 id 只与恰好一个武器 id 配对；重试返回 duplicate（重复）receipt（回执），不会再次授予。

<a id="persistence-and-capacity"></a>
## 持久化与容量

聚合在每次写入前与重开时进行校验。服务卸载先停止接收新变更，等待两个域已接收的操作完成，再关闭存储。关系失败、已变更的部署配置、陈旧任务或产物 revision、缺失 owner、非法评审转换，以及精确一次容量耗尽，都会明确失败。只有 activity（活动）是滚动保留；processed event id 与武器授予绝不驱逐，因为驱逐会让延迟重试生成第二枚武器。事件 id 容量必须覆盖武器容量。

<a id="shared-server-teams"></a>
## 共享服务器团队

`teams()` 列出本机已知空间与托管状态，不发出网络请求；`summary({ teamId })` 获取当前成员权限状态，用于交接与成员列表筛选。只有所有者可见邀请详情与受邀成员到期时间。历史身份保留在 `view().members` 中以维持归属；当前成员列表和在线人数必须按摘要中的有效成员 id 筛选。`createTeam({ serverUrl, serverAccessToken, name, goal, memberName, memberRole })` 在服务器上创建数据，本机只保留连接元数据与成员凭证。省略 `serverUrl` 时创建仅含所有者的本机团队。新团队不含模拟同事。连接器单独验证服务器创建权限；本包不保留部署连接码。

所有者通过 `createInvite` 指定受邀人的姓名和角色，创建绑定成员的邀请。返回的 `dsh-team://join` 邀请码含服务器 URL、团队 id 和随机秘密。`joinRemote({ inviteCode })` 生成设备凭证、兑换邀请，并通过 `ctx.credentials` 保存凭证。服务器只保存凭证与邀请的摘要。邀请默认 24 小时过期（请求可选 1–168 小时）、仅可兑换一次，且可撤销；同一凭证重试同一次兑换是幂等的。`revokeMember` 阻止后续成员操作，并保留历史归属。仅撤销邀请不会撤销已加入成员的权限。 成员到期或被移除后，可在原设备的现有加入入口使用新邀请：必须先由同一服务器明确拒绝旧凭证。已有有效身份、所有者身份或网络请求失败都会阻止替换。新邀请分配新的成员身份；旧任务和文件保留原有归属，所有者可将未完成任务交给新成员。

只有专用连接器调用 `createHostedTeam`、`acceptInvite` 和 `dispatchAuthenticated`，它们均不是浏览器 Remote 方法。共享命令按严格允许列表校验，并从有效成员凭证推导身份。所有者凭证不会自动过期，现有已存储所有者也适用，唯一所有者不能撤销自己的成员权限。受邀成员凭证在 `membershipLifetimeHours` 后到期；已撤销凭证始终被拒绝。真实团队拒绝 `actingMemberId`。团队所有者管理邀请与成员，任务归属及独立验收规则仍然生效。原有浏览器启动凭据拥有私人 Host 权限，绝不能作为团队邀请共享。

`team_battle_directory` 保存托管元数据、邀请、凭证摘要与本机连接引用。每个托管团队分别拥有 `team_battle_<id>` 与 `team_battle_space_<id>` 存储域；原有格式保持不变。服务器是其团队的唯一写入者。成员设备不缓存共享文件字节，也不向服务器复制私人 Session 日志。加入前先保存本机凭证，以便响应丢失后使用同一身份重试。同一所有者凭证与相同元数据的服务器创建操作是幂等的。

连接器提供 `registerNetworkTransport`；`networkStatus`、`startHosting({ host, port })` 和 `stopHosting` 管理其独立监听器。HTTPS 服务器 URL 可包含部署路径。托管及已加入空间拒绝 `sendFile`：在本机投递消费者实现前，成员应下载选定字节到自己的设备用于个人 AI 工作。系统不会为服务器的 Codex 连接器排队这些文件。

<a id="local-collaboration-simulation"></a>
## 本地协作演练

仅原有空间支持 `allowSimulation`，默认是 `false`；关闭时，任何携带 `actingMemberId` 的浏览器请求都会被拒绝。启用后，`TeamBattleActorRequest.actingMemberId` 必须对应已配置成员。`view(request?)`、`space(request?)`、每个浏览器变更与文件读取均支持此请求身份；省略时使用 `localMemberId`。返回的项目视图标明请求成员，并提供 `simulationEnabled`。客户端在单个页面内保留角色选择，并在读取、写入和心跳请求中传递。并发调用不会改变服务全局的当前成员。Query hook 与本地 Session 事件仍使用各自已配置身份。

演练使用一个仅监听本机的 Host 和一个持久化项目。此模式允许模拟名册成员进行产品测试，不提供成员身份认证，不得作为公开协作服务开放。该选项仅在运行时生效，切换不会改写或使已有部署记录失效。不同 Host 进程不得共享可写存储。

任务负责人提交文件，由其他成员通过或退回产物；两种决定均禁止作者自行操作。只要有产物通过，任务就保持 `completed`；仍有产物待审时保持 `submitted`；全部产物均被退回后才恢复为 `in_progress`。修改后，以同目录下不同名称发布新文件，再提交到同一任务。原字节和终态评审记录会保留。已完成任务的独立后续工作需要新建任务。

<a id="model-experience"></a>
## 模型体验

### 项目协作状态

#### 模型看到什么

没有直接内容。团战记录是存储域与浏览器 Remote 状态；本包不注册 prompt（提示词）片段、tool schema（工具模式）或模型可见 Session 事件。

#### Token 影响

直接影响为零。观察人类 `user/message` 时，只会在模型历史之外记录无内容的 Query 幂等键与武器授予。

#### KV Cache 影响

彼此独立。团战 mutation 与浏览器读取不会修改模型请求或其可复用前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **凭证生命周期**——受邀成员到期或被移除后需要新邀请；不提供自动续期、凭证丢失恢复、所有权转移或同一成员多设备加入。所有者凭证不会自动过期，必须保持私密。每次重新加入都会保留旧身份并占用新的成员名额；配置的成员和邀请上限仍然生效。已兑换邀请不能由另一设备使用。
- **明确发布**——个人 AI 对话与生成文件不会自动发布。共享团队不支持 Codex 投递；用户需下载文件到自己的设备。
- **单 writer（写入者）进程假设**——operation（操作）串行化仅位于进程内；多个 Harness 进程不得同时打开并修改同一团战聚合。
- **有限文件存储与连接器责任**——上传字节保存在聚合内，适合有界小文件；连接器必须实际交给 Codex 后再确认，Query hook 本身不消费投递。外部 URI 产物仍只保留元数据。
- **浏览器轮询更新**——Host 会发出 `team-battle/changed`，但此 MVP 浏览器通过重复调用 `view()` 刷新，而不是经选定的 Gateway Remote 事件。
- **有限 Query 历史**——到达 `maxProcessedEventIds` 或 `maxWeaponGrants` 后，在将来有明确保留设计之前，会停止新授予。

<a id="dev-note"></a>
### 开发备注

无。
