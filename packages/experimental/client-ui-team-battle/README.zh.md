---
description: "使用和开发实验性 Team Battle 团队空间与会话飞行侧栏。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-team-battle

[English](README.md) | 中文

## 概述

这个私有 Web 包把权威 Team Battle 项目呈现为根级 `团队空间` 页面，并在普通 Chat 旁边添加可选飞行游戏。两个界面都调用生成的 `ctx.remote.teamBattle` 服务，不保存第二份项目模型。团队页管理成员、加权任务、已发布 Context、产物来源、人工评审和活动。游戏得分与生命只在浏览器内；Query 武器补给、娱乐护盾、项目进度和核心 HP 始终来自 Host 投影。

请通过实验性 Team Battle Web profile（配置组合）使用此包。它不是稳定公开扩展点。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

在稳定 Web profile 和 Host 端 Team Battle profile 之后应用 [`@deepseek-ai/dsh-experimental-team-battle-web-profile`](../team-battle-web-profile/README.zh.md)。Client 加载器会挂载此包的 `/client` 导出和生成的 [`@deepseek-ai/dsh-experimental-team-battle/remote`](../team-battle/README.zh.md) 贡献。根 Host 导出不执行业务，此包也没有配置字段。

### 在团队空间协作

在侧栏选择 **团队空间**，或以 `#team`（也接受 `?team=1`）打开应用，无需已有私人会话。会话视图也保留团队入口。页面会轮询 Team 与文件投影并发送在线心跳。它提供：

- 项目选择、服务器空间创建、一次性邀请、成员管理和当前在线状态；
- 带文件夹、面包屑导航、排序、选择及版本和来源详情的文件表格；
- 明确上传文件字节、安全的图片与文本预览、下载、重命名和删除；
- 下载文件供个人 AI 使用，以及仅用于原有本机空间、收到接收端确认后才改变状态的 Codex 投递队列；
- 携带当前 revision（修订号）的创建、编辑、认领、交接、释放、提交待审、重开和删除任务操作；
- 显式发布 Context，包含决定、阻塞、下一步和来源引用；
- 提交包含任务、URI、媒体类型、字节数和 SHA-256 来源的产物元数据；
- 作为终态操作的人工“验收通过”或“要求修改”评审；
- 当前活动、项目 revision 和已验收权重进度。

文件是默认标签页。发布需要选中本地文件并明确确认，不会导入私人聊天。文件可以提交到已认领任务以供验收。验收页优先显示产物卡片、关联任务标题和上传时填写的文件版本，手动提交外部链接的表单默认折叠在列表下方。排队状态表示连接器尚未确认接收，不代表 Codex 已执行提示。页面不会启动接收端或 Codex 进程。

Host 启用 `allowSimulation` 时，页面显示 **本地演练** 和当前操作成员选择器。选择仅属于此页面；每次读取、心跳和变更都携带该成员，不改变其他浏览器标签页的身份。关闭演练时，页面保持配置的成员且隐藏切换控件。作者不能验收自己的产物；其他成员可以要求修改，随后由作者上传并提交修订文件，重新接受验收。

一份产物被验收后可能会完成其关联任务，因此已完成任务不显示重开操作。由于 deployment limit（部署上限）不在浏览器投影中，任务计数只显示当前数量。

### 发起或加入服务器项目

通过 **发起新项目** 填写共享 HTTPS 服务器地址、管理员提供的创建授权码、项目名称与目标，以及自己的姓名和角色。本机 Host 保存成员凭证；浏览器只保存选中的项目 ID。**邀请同事** 生成指定姓名和角色、有有效期且只能使用一次的邀请。同事在自己的应用中通过 **通过邀请加入** 粘贴邀请。发起人可以撤销待用邀请或移除成员；已发布产物仍向剩余成员保留。选中的空间显示共享数据保存位置。原有配置项目继续保留，明确标识为本地演练。

请向服务器部署管理员获取完整的创建授权码。它不是新设置的项目密码，也不是个人模型 API Key。服务器拒绝授权时，表单会提示核对服务器地址和授权码，并保留项目与成员信息供更正后重试。创建成功后清空授权码，浏览器存储不会保存它。

每位成员的模型配置、Session（会话）和未发布工作目录均留在各自设备。任务可复制到个人 AI 对话，共享文件可下载。空间不自动同步源码目录，也不启动他人的 agent。任务、填写的纪要、明确选择的完整文件、验收意见和成员在线状态进入共享空间。上传对话框在发送字节前显示目标空间及发布范围。服务器空间不提供原有 Codex 队列，因为本机连接器无法消费该服务器队列。

任务页说明从建任务、认领或交接，到明确发布文件并提交、其他成员验收，再到完成或修改的过程。交接时选择可访问空间的下一位负责人，并可填写交接说明；不会附带私人对话。空间发起人可重新分配未完成任务，当前负责人可交接自己的任务。团队 profile 隐藏“轨迹”视图。

### 在 Chat 旁运行游戏

Chat 保留原有记录和输入框。小游戏默认为收起的 **展开小游戏** 单行入口，供等待 AI 时消遣，不会自动展开。展开后在宽屏最多占 280 像素及聊天区域的 28%，窄屏高度最多占视口一半。输入框始终与对话记录保持同一中心轴：收起或上下排列时占用完整聊天列，展开并排时占用小游戏旁的剩余列。收起会停止动画，保留当前得分、生命及暂停状态，直到 Chat 界面卸载。使用鼠标，或聚焦游戏画布后用左右方向键移动；编队会自动发射普通火力。暂停和重开只影响浏览器内的游戏状态。

一次独立的人类 Query 会发放一枚持久武器。库存从 `weaponGrants`（武器发放记录）实时刷新；点击其操作或聚焦 Canvas 后按 Space（空格）会调用 `teamBattle/consumeWeapon`。消费成功后清除当前敌机，且只损伤 `combatShield`（娱乐护盾）。普通弹药、碰撞、得分、生命、暂停和重开都不调用项目进度变更。`progress`、`coreHp` 和 `combatShield` 会作为不同数值显示。

Canvas 使用 [`src/assets`](src/assets) 中的原创素材，它们从仓库 Team Battle 飞行原型复制而来。减少动效偏好会移除装饰移动和闪光，但保留控制和游戏状态。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[`src/client/mount.ts`](src/client/mount.ts) 挂载生成的 Remote（远程服务）贡献、注册双语字典，并提供可销毁的根级导航和 `shell.overlay` 入口、`conversation.view` 中 id 为 `team` 的列表项，以及单实例 `conversation.chat.sidecar` 飞行面板。根级页面保留下方的私人对话状态。操作返回项目、文件空间或文件内容投影对应的类型化 Remote 结果。

[`src/client/useTeamBattleLive.ts`](src/client/useTeamBattleLive.ts) 执行“最新请求优先”轮询，变更进行时拒绝轮询提交，并上报在线状态。每次变更成功都替换完整投影。[`src/client/TeamSpaceView.tsx`](src/client/TeamSpaceView.tsx) 只持有临时表单和 tab（标签页）选择。[`src/client/FlightCanvas.tsx`](src/client/FlightCanvas.tsx) 只持有不持久的移动、敌机、碰撞、得分和生命。

</details>

<a id="further-exploration"></a>
## 延伸阅读

- [Team Battle 服务](../team-battle/README.zh.md) — 持久聚合、变更、Query 补给和进度规则。
- [Team Battle Web profile](../team-battle-web-profile/README.zh.md) — 浏览器与 connector（连接器）组合。
- [Conversation Chat](../../client/ui-chat/README.zh.md) — 可选聊天侧栏插槽的所有者。
- [Conversation UI](../../client/ui-conversation/README.zh.md) — 视图导航的所有者。

<a id="model-experience"></a>
## 模型体验

### 仅浏览器端的团队控制

#### 模型看到什么

模型不会从本包看到任何内容。本包不注册面向模型的 prompt（提示）、工具或 Session 事件；`ctx.remote.teamBattle` 读取与 mutation（变更）都不进入模型历史。

#### Token 影响

直接 Token 影响为零。轮询、在线状态、表单提交、游戏帧和武器消费都不会进入模型请求。

#### KV Cache 影响

彼此独立。仅浏览器端的读取与变更不会修改模型请求或其可复用前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- **使用轮询而非 push（推送）** — 每个已挂载界面定期刷新；首版不消费专用浏览器事件流。
- **明确交换文件** — 加入服务器空间只共享已发布产物，不同步源码，也不远程控制同事的 AI。
- **接收端配置** — 文件投递需要经过身份验证的 Codex 连接器拉取并确认队列；本客户端不安装或运行外部 agent。
- **本地娱乐状态** — 刷新页面会按设计重置飞行得分、生命、敌机和暂停状态。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景 — 点击展开</summary>

飞行组合参考 `apps/web/prototypes/team-battle-flight/concepts/chat-game-v3/unified-flight-deck.png`；团队空间参考 `team-space-page.png`。项目进度与娱乐战斗状态必须在视觉和行为上都保持分离。不得添加会变更任务、产物评审或已验收权重进度的游戏回调。

</details>
