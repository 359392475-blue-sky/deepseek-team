---
description: "使用 Bearer 认证的精确路由 HTTP 入口，以及一个不传递内容的 Codex UserPromptSubmit 团战 Query helper。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-team-battle-connector-http

[English](README.md) | 中文

## 概述

同事可以通过固定 HTTPS 团队服务器交换明确发布的项目、任务和文件，同时把私人会话留在各自的本机 DeepSeek。专用团队端口只接收创建、加入和经过成员认证的团队操作；原有 Codex helper 只发送 Query 身份元数据，不发送 prompt（提示词）文本。

## 目录

- [插件配置](#plugin-configuration)
- [固定团队服务器](#shared-team-server)
- [HTTP 约定](#http-contract)
- [文件投递 HTTP 路由](#file-delivery-http-routes)
- [Codex UserPromptSubmit helper](#codex-userpromptsubmit-helper)
- [安全与运行](#security-and-operation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="plugin-configuration"></a>
## 插件配置

| 字段 | 含义 |
|---|---|
| `path` | 精确的绝对非根路径，不带尾随斜杠、query（查询）或 fragment（片段）。 |
| `secretEnv` | 包含预期 Bearer token 的 credential reference（凭证引用）。 |
| `maxBodyBytes` | 原始请求 body（请求体）的正安全整数字节上限。 |
| `maxNetworkBodyBytes` | 独立团队请求和响应的字节上限，默认 8388608。 |
| `networkRequestTimeoutMs` | 团队网络请求超时毫秒数，默认 15000。 |
| `hostedServer` | 可选的开机托管配置：`host`、`port`、`accessTokenRef`；省略时不会启动共享监听。 |

`path`、`secretEnv` 和 `maxBodyBytes` 是必填字段。非法路由或 credential-reference 名字会在加载时失败。每个请求都会重新解析 credential 值，因此轮换会影响下一个请求；当前缺失值时返回 `503`，不准入事件。

<a id="shared-team-server"></a>
## 固定团队服务器

专用监听仅接受精确的 `POST /create`、`POST /join` 和 `POST /call`。`/create` 使用部署级 Bearer 创建码，`/join` 交换邀请和加入设备生成的成员令牌，`/call` 使用成员 Bearer 令牌。团队领域从令牌确认项目成员及其权限；请求不能借用角色演练来切换身份。其他路径（包括 `/api`）返回 `404`，来自浏览器 `Origin` 的请求被拒绝。

应用始终通过自己的本机 Host 代理团队请求。地址允许 HTTPS 服务器及反向代理前缀，例如 `https://lowpower.me/team-battle`；HTTP 仅允许私有 IP 字面量。地址不得携带登录信息、query、fragment 或歧义路径。代理限制请求和响应大小、禁止重定向，并且不会自动重试业务操作。`POST /create` 返回 HTTP 401 时，浏览器收到 Remote 错误 `team-battle/server-auth-required`，详情为 `{ httpStatus: 401 }`；用户应核对服务器地址，并向管理员获取当前创建码后主动重试。该错误不包含响应正文或提交的创建码。只有携带 `TEAM_BATTLE_ACCESS_DENIED` 的 HTTP 403 才会转换为有类型的成员凭证拒绝，其他服务端诊断保持私有。请求中断后，用户应先读取团队状态再决定是否重试。

[独立 profile](deploy/profile/cordis.patch.yml) 由 `dsh --profile team-server` 启动；把[配套清单](deploy/profile/package.json)和配置放入独立 `DSH_HOME` 的 `profiles/team-server`。它加载 JSON 存储、凭证、Typert 注册表与团队服务，不挂载模型、浏览器、终端、会话或目录 API。`TEAM_BATTLE_SERVER_ACCESS_TOKEN` 由部署环境提供；创建码不得发给普通邀请成员。团队监听使用 `127.0.0.1:18864`；反向代理负责 HTTPS，并剥离公共 `/team-battle` 前缀。数据保存在该 `DSH_HOME` 的 `storages`，应独立备份。应用或进程重启不会重发已提交的业务操作。

产物打包使用 [pack.mjs](deploy/pack.mjs)，输入已构建的工作区，输出真实 `dsh` CLI、此 profile 与最小运行依赖；不会在服务器安装或构建整个仓库。参数依次为尚不存在的输出目录和 `linux-x64-gnu` 或 `darwin-arm64`。Linux 原生加载器预构建包必须匹配工作区锁文件的完整性值。产物中的 [smoke.mjs](deploy/smoke.mjs) 以独立临时数据目录运行原始 CLI，检查创建、重启持久化及私人 API 拒绝；在与目标匹配的平台执行 `node smoke.mjs /absolute/runtime/path`。

原有 Codex 路由由另一个仅限本机的随机端口承载；独立服务器默认未配置其凭证。团队文件下载只读已发布字节，不能读取成员工作目录；私人会话、模型凭证和终端始终不属于专用监听的服务集合。

<a id="http-contract"></a>
## HTTP 约定

请求必须携带恰好一个 `Authorization: Bearer <token>` header（请求头）与 JSON media type（媒体类型）。认证后，connector（连接器）会读取有界严格 UTF-8，并且只接受以下对象：

```json
{"version":1,"type":"query","eventId":"codex:9:session-1:turn-2","memberId":"engineering","occurredAt":1788134400000}
```

未知字段非法。发送方不能附加 `prompt`、`query`、transcript（对话记录）或任意元数据。响应 body 是服务回执 `{ eventId, duplicate, weaponId }`，绝不包含请求内容。

| 状态 | 含义 |
|---|---|
| `202` | 新 Query 事件及其武器授予已持久提交。 |
| `200` | 事件 id 已提交；返回原武器 id。 |
| `400` | JSON、事件字段或所定址成员非法。 |
| `401` | Bearer header 或 token 非法。 |
| `405` | method（方法）不是 `POST`。 |
| `413` | 声明或流式 body 超过 `maxBodyBytes`。 |
| `415` | media type 不是 `application/json`。 |
| `503` | credential 解析、容量、存储或团战不可用。 |

<a id="file-delivery-http-routes"></a>
## 文件投递 HTTP 路由

同一 Bearer 凭证还保护两个精确的 `POST application/json` 路由：`<path>/deliveries/pull` 接收 `{ memberId }`，返回最早的 `{ delivery, content: { file, contentBase64 } }` 或空对象；`<path>/deliveries/ack` 接收 `{ memberId, deliveryId, outcome: "delivered" | "failed", note? }`，持久化后返回投递记录。两者成功时都返回 `200` 并拒绝未知字段。默认要求服务配置的本地成员；显式启用 `allowSimulation` 后，本地演练可选择任一已知名册成员。共享 Bearer 凭据不认证各成员身份。

拉取保持 `queued`，可安全重试；相同终态确认是幂等的，冲突确认被拒绝。消费方必须在字节实际交给本地 Codex 后才确认 `delivered`；该值是连接器声明，服务器不独立验证 Codex。仅安装 `UserPromptSubmit` helper 不会消费文件投递。响应最多包含一个文件，受团队文件空间的单文件上限约束；投递不会创建模型消息或更改在线状态。

<a id="codex-userpromptsubmit-helper"></a>
## Codex UserPromptSubmit helper

`./codex-hook` 导出与 `dsh-team-battle-codex-hook` binary（可执行命令）都使用位于 `lib/bin.js` 的已打包 Node command 入口。请在启动 Codex 的进程中配置以下 environment value（环境值）：

| 环境值 | 含义 |
|---|---|
| `TEAM_BATTLE_URL` | 完整 connector URL，不带 credential、query 或 fragment。 |
| `TEAM_BATTLE_TOKEN` | 与 `secretEnv` 背后 credential 匹配的 Bearer token。 |
| `TEAM_BATTLE_MEMBER_ID` | 从此 Codex 接收 Query 武器的团战成员。 |

在已安装本包的项目中使用此 `hooks.json` 条目：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./node_modules/@deepseek-ai/dsh-experimental-team-battle-connector-http/lib/bin.js"
          }
        ]
      }
    ]
  }
}
```

helper 会读取有界 JSON stdin，但只选取 `session_id` 与 `turn_id`。它把 `eventId` 构造为 `codex:<session-id-byte-length>:<session-id>:<turn-id>`，发送严格的五字段事件，成功时不写 stdout（标准输出），并在配置、输入、网络或 endpoint（端点）失败时以非零状态退出并给出无内容诊断。重试同一 Codex turn（轮次）会构造同一事件 id，因此服务返回原武器，而不是再授予一枚。

<a id="security-and-operation"></a>
## 安全与运行

使用高熵凭证并通过 HTTPS 公开独立团队监听。此包不终止 TLS，也不限制请求频率；反向代理负责这些部署控制。原有 Codex 路由使用共享令牌，不能替代团队成员认证。此包不记录请求体、令牌或提示词文本。

<a id="model-experience"></a>
## 模型体验

### Query 信号传输

#### 模型看到什么

没有。connector 与 `UserPromptSubmit` command helper 在模型请求组装之外运行，且成功时不产生 hook stdout。

#### Token 影响

为零。command helper 丢弃 prompt 内容，只向团战存储发送 Query 身份元数据。

#### KV Cache 影响

彼此独立。HTTP 认证与 Query 准入不会修改模型请求或其可复用前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **旧 Codex 权限** — Query 与投递路由保留共享 Bearer 凭证；只有专用团队监听使用成员认证。
- **没有传输重试循环**——helper 失败时以非零状态退出；在适合重试时，由调用方或用户重新运行同一轮安全命令。
- **没有 TLS 或限流**——在把路由暴露给受信回环或私有网络之外之前，部署必须从包外提供这些能力。
- **Codex id 必填**——hook stdin 缺少非空 `session_id` 或 `turn_id`，或任一 id 超过 200 个 UTF-8 字节时，会在不发送请求的情况下失败。

<a id="dev-note"></a>
### 开发备注

无。
