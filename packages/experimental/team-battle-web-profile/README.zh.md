---
description: "为团战版浏览器 UI 与经认证的 Codex 事件入口提供的私有 Web profile 层。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-team-battle-web-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-team-battle-web-profile` 在已挂载团战项目 service（服务）的 Web profile 中加入真实团战浏览器界面和经认证的 Codex HTTP 连接器。浏览器将私人 Harness 对话与可玩的飞机大战放在同一首屏，并用独立「团队」页展示成员、任务、已发布 Context、产物、验收、来源详情和活动。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 `dsh-web-app` 和 `dsh-experimental-team-battle-profile` 之后添加本层。发送连接器事件前设置 `TEAM_BATTLE_CODEX_TOKEN`；缺少 credential（凭证）时 UI 仍可使用，但连接器会明确返回不可用，不会接受未认证输入。

项目创建使用 Host 配置的 `sharedServer`：`https://lowpower.me/team-battle`，凭证引用为 `TEAM_BATTLE_SERVER_ACCESS_TOKEN`。将部署权限保存在发起者 Host 的凭证提供方，不得将实际值写入本 profile 或浏览器。项目表单只需项目与成员信息；受邀同事使用链接加入，无需创建权限。测试或其他部署在完整 Host 层配置中更新 `sharedServer` 的两个字段；本 Web 层不替换该配置。

本层仅在团队版中禁用“轨迹”界面，标准 Web profile 仍然保留它。飞机小游戏默认收起，可在等待时展开，不会取代 Chat。

添加工作区时，目录浏览器会在团战版窗口内打开，包括 macOS 应用。它浏览运行 Host 的电脑；选择工作区不会把其中的文件发布到团队空间。

首个连接器只接收不含内容的 Query pulse（Query 脉冲）。用户确认的状态、Context、产物、任务和验收变更由浏览器 Remote（远程调用）提交，不经过 Codex 连接器。Query 重试必须复用同一事件 id，连接器也不会接收完整私人对话。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

[`cordis.patch.yml`](cordis.patch.yml) 插入受 credential 保护的 HTTP 适配器和浏览器 plugin（插件），并在此组合中禁用 `ui-trajectory`。本层用 Host 和 UI 的 browse 插件替换自动目录选择器，使工作区选择始终在应用内可见。浏览器 plugin 挂载自动生成的 `teamBattle` Remote（远程调用）contribution（贡献项），提供可收起的聊天小游戏，并把完整团队页注册为 Conversation view（对话视图）。个人 Codex 进程不共享浏览器 session（会话），因此连接器独立认证。

本包不发布运行时 invariant（不变量）companion（配套插件），因为此 bundle（配置包）仅包含静态 Web 组合，不拥有运行时状态；浏览器与连接器插件负责各自的运行时行为。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [团战浏览器 UI](../client-ui-team-battle/README.zh.md)——可玩游戏与共享团队页。
- [团战 HTTP 连接器](../team-battle-connector-http/README.zh.md)——Codex 事件信封与认证。
- [团战 Host profile](../team-battle-profile/README.zh.md)——项目配置与持久化域。

-----

<a id="model-experience"></a>
## 模型体验

### Codex 中继

#### 模型会看到什么

系统不会自动注入任何内容。已发布的团队 Context 保持为项目事实，直到用户明确选择通过未来的 `teamBattle` connector（连接器）操作投递给个人 agent（智能体）；Query 脉冲不含文本。

#### Token 影响

首个 Web 层不直接增加 Token。

#### KV Cache 影响

在未来连接器执行经用户批准的 Context 注入之前，不影响 KV Cache。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **连接器 token 属于整个 profile**——首个适配器认证一个受信任的 Codex 连接器密钥；每成员可轮换 token 后续实现。
- **不静默唤醒并执行**——团战板保存共享事实，但不把入站文本转换成命令或工具调用。
- **公网账号认证仍是独立能力**——浏览器进程认证适合私有预览，不是生产人类身份或租户隔离。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文</summary>

本 profile 已插入 browse 目录选择器插件。不要再叠加 `apps/web/tests/pin-browse-picker.overlay.yml`：该独立 Web 测试 overlay（覆盖层）会插入相同的插件 ID。

</details>
