---
description: "在 dsh-base 上启用持久化团战项目域的私有 profile 层。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-team-battle-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-team-battle-profile` 把团战版的共享项目 service（服务）加入源码 checkout（检出目录）的 profile。它的 patch（补丁层）提供一个成员、存储上限和 Query 护盾伤害都可配置的四角色初始团战。项目事实由 `dsh-base` 已挂载的 storage-domain（存储域）栈持久化；浏览器界面和 Codex HTTP 适配器由独立 Web 层负责。

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

从源码 checkout 添加 Web 应用和两个团战层，初始化私有的 Team Battle profile：

```sh
pnpm dsh plugin --profile team-battle add ./packages/bundle/web-app
pnpm dsh plugin --profile team-battle add ./packages/experimental/team-battle-profile
pnpm dsh plugin --profile team-battle add ./packages/experimental/team-battle-web-profile
pnpm dsh --profile team-battle
```

部署前修改 patch 中的初始成员名称、项目目标、容量上限、本地成员身份和在线超时。`memberOfflineAfterMs` 可防止已断开的成员仍被显示为在线，初始层使用 60 秒。默认四个业务角色是产品、研发、测试和 UI；它们是配置，不是固定的权限模型。

原有本机空间显示从 `DSH_HOME` 解析的 JSON 存储目录，服务器项目显示连接的服务器地址。

项目创建使用本 Host 层的 `sharedServer` 配置，默认地址为 `https://lowpower.me/team-battle`，凭证引用为 `TEAM_BATTLE_SERVER_ACCESS_TOKEN`。实际值保存在发起者 Host 的凭证提供方。后续 patch 提供 `config` 时，Cordis 会替换整个配置对象；覆盖配置时必须保留必需的项目字段和成员列表，不能仅提供 `sharedServer`。Web 层不改写 Host 条目。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节</summary>

本包没有运行时 plugin（插件）主体。[`cordis.patch.yml`](cordis.patch.yml) 在 `dsh-base` 之后插入 `@deepseek-ai/dsh-experimental-team-battle`；`dsh-base` 提供存储枢纽、JSON 后端和 domain form（域数据形态）。团战 service 拥有成员、任务、Context、产物、验收、活动、Query 奖励和项目进度语义。

本包不发布运行时 invariant（不变量）companion（配套插件），因为此 bundle（配置包）仅包含静态组合，不拥有运行时状态；配置中的服务负责各自的运行时关系。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [团战 service](../team-battle/README.zh.md)——持久项目事实与自动生成的 Remote（远程调用）方法。
- [团战 Web profile](../team-battle-web-profile/README.zh.md)——浏览器界面与经认证的 Codex 入口。
- [团战版产品决策](../../../.agents/notes/proposed/feature/2026-08-21-team-battle-collaboration-edition.zh.md)——产品范围与隐私规则。

-----

<a id="model-experience"></a>
## 模型体验

### 共享项目事实

#### 模型会看到什么

静态 bundle（组合包）本身不向模型暴露任何内容。被插入的团战 service 保存项目事实并暴露 `teamBattle` Host Remote（主机远程调用）方法；连接器或 UI 必须明确发布选中的 Context。

#### Token 影响

直接请求 Token 为零。

#### KV Cache 影响

无；本 bundle 不改变模型请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅限源码 checkout**——本包为私有实验包，不进入官方发布。
- **单个已配置项目**——首个实现为每个 profile 保存一个团战聚合，还不是公网多租户。
- **部署身份不等于人类账号认证**——生产 `lowpower.me` 部署仍需在本地 Harness 浏览器 token 之外增加账号与项目 ACL（访问控制列表）载体。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文</summary>

无。

</details>
