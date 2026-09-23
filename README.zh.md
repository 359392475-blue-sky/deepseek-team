# DeepSeek Harness · 团战版

[English](README.md) | 中文

本仓库提供基于上游 DeepSeek Harness `0.1.7-alpha.2` 的 **团战版 0.1 协作版本**，包含前端、后端、固定共享服务器实现和原生 macOS 外壳。早期浏览器原型保留在 [`legacy-prototype/`](legacy-prototype/)。

## 团队协作

- 创建和选择团队项目，为指定同事生成邀请，并从另一个本机客户端加入。
- 通过固定 HTTPS 服务器共享任务、填写的协作纪要、明确发布的文件和验收意见。
- 认领或交接任务，提交产物，退回修改，再验收修订结果。
- 模型密钥、私人 AI 对话和未发布文件保留在各成员自己的设备上。
- 等待 AI 时可使用紧凑、可收起的飞机小游戏；团战版 profile（配置组合）屏蔽轨迹入口。

## 启动团战版

请使用本仓库源码。**官方 npm 包和下文的上游命令启动标准 DeepSeek Harness，不包含这里的团战版定制。**

1. 按[开发环境说明](docs/development.zh.md)准备 Node.js 和 pnpm，安装依赖并构建源码。仓库声明 Node.js `^22.19.0 || >=24.0.0` 和 pnpm `11.7.0`。
2. 使用 Web 客户端时，按[团战版 profile 配置](packages/experimental/team-battle-profile/README.zh.md#use-this-package)加入 Web 和团队配置层，再启动 `team-battle` profile。
3. 使用 Apple Silicon macOS 应用时，按[构建与安装说明](apps/macos/README.zh.md)操作。本次源码发布不提供经过公证的 macOS 安装包下载。
4. 跨网络协作需要部署[共享 HTTPS 团队服务器](packages/experimental/team-battle-connector-http/README.zh.md#shared-team-server)。项目发起人向服务器管理员获取完整创建授权码；同事使用各自的邀请加入，并保留自己的模型配置。

共享服务器保存已发布的项目数据，不会同步工作目录或自动运行同事的 AI。[创建、加入、发布与交接指南](packages/experimental/client-ui-team-battle/README.zh.md)介绍完整使用路径。

## 源码入口

| 组件 | 源码与说明 |
| --- | --- |
| 团队页面与可选小游戏 | [前端](packages/experimental/client-ui-team-battle/README.zh.md) |
| 项目、成员、任务、文件和验收 | [后端](packages/experimental/team-battle/README.zh.md) |
| 共享服务器与 HTTP 通信 | [服务器部署](packages/experimental/team-battle-connector-http/README.zh.md) |
| 原生 macOS 应用 | [应用外壳](apps/macos/README.zh.md) |

这是源码发布。仓库完整保留上游工作流文件，但本个人展示仓库不运行上游自动流水线。原有 MIT 许可证及第三方声明保持完整。以下章节介绍上游项目。

## 上游 DeepSeek Harness

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

### 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

### 运行

#### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

#### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

### 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

### 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

### 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

### 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

### 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
