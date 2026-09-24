# DeepSeek Harness · 团战版

[English](README.md) | 中文

各自使用自己的 AI（人工智能），通过团队空间协作。团战版让同事共享决策、文件、任务和验收反馈，下一位成员可以带着这些信息，在自己的 DeepSeek 对话中继续工作。

这是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `0.1.7-alpha.2` 的独立开源协作版本，并非 DeepSeek 官方团队产品。项目处于早期预览阶段，API 与存储数据格式可能变化。

[下载与安装指南](https://lowpower.me/team-battle-downloads/) · [GitHub 发布版本](https://github.com/359392475-blue-sky/deepseek-team/releases) · [试玩协作案例](https://lowpower.me/team-battle-demo/) · [MIT 许可证](LICENSE)

## 目录

- [团队协作](#team-collaboration)
- [开始协作](#start-team-battle)
- [贪吃蛇协作案例](#collaboration-example)
- [从源码开发](#run-from-source)
- [上游与许可证](#upstream-deepseek-harness)

<a id="team-collaboration"></a>
## 团队协作

每位同事运行独立客户端，使用自己的模型凭据和私人对话。共享 HTTPS 服务器仅保存成员明确发布的项目信息。

| 团队空间中共享的内容 | 保留在各成员设备上的内容 |
| --- | --- |
| 项目目标、成员、任务与交接 | 模型凭据与设置 |
| 已发布的 context（上下文）：决策、阻塞和下一步 | 私人 AI 对话与未提交草稿 |
| 选定的文件、版本标签与验收反馈 | 未发布的文件与工作目录 |

成员把已发布的上下文复制到自己的 AI 对话，并下载需要的文件。团队空间不会同步工作目录，也不会自动运行另一位成员的 AI。[团队空间指南](packages/experimental/client-ui-team-battle/README.zh.md)介绍发布、交接与验收的具体操作。

<a id="start-team-battle"></a>
## 开始协作

下载版应用支持 **Apple Silicon Mac，系统要求 macOS 15 或更高版本**。分发 ZIP 内的应用已使用 Developer ID 签名并通过 Apple 公证，详见[安装指南](https://lowpower.me/team-battle-downloads/)。目前不提供 Intel Mac 或 Windows 安装包。

1. 每位同事安装应用，选择自己的本地项目目录，并配置自己的[模型提供方](docs/user/guide/providers.zh.md)。
2. 项目发起人先配置[共享服务器与创建凭据](packages/experimental/team-battle-connector-http/README.zh.md#shared-team-server)，再选择“发起团队项目”，填写目标并邀请同事。创建凭据由服务器管理员提供，受邀同事无需持有。
3. 同事打开邀请链接，查看安装与加入说明，复制完整链接，再粘贴到自己应用的“通过邀请加入”中。成功加入后会打开共享项目。
4. 发起人与自己的 AI 沟通，将有用的上下文和选定文件发布到空间。同事通过“复制任务给我的 AI”或“复制共享上下文给我的 AI”获取信息，下载引用的文件，再在自己的对话中接着工作。
5. 同事发布产物并提交验收。另一位成员验收通过或退回修改；作者修订后再次提交，直到任务通过验收。

邀请过期或被撤销时，请发起人生成新链接。无法直接复制时，可选中应用显示的文本手动复制。修订文件需要使用新名称或版本目录；发生重名冲突时，已选文件和填写的草稿会保留，改名后即可重试。

<a id="collaboration-example"></a>
## 贪吃蛇协作案例

[试玩协作完成的贪吃蛇游戏](https://lowpower.me/team-battle-demo/)。案例由产品经理和研发完成市场调研、产品需求文档、开发、独立产品验收、修订与通过验收。两个角色各自与自己的 DeepSeek 沟通，通过共享上下文、文件、任务和验收意见交接工作。

这次演练使用同一台 Mac 上两套隔离的 DeepSeek 实例和成员身份，通过公网团队服务器协作，验证了上述使用链路；它不代表已经覆盖两台物理电脑或真实移动设备。游戏交付范围不包含音效。

<a id="run"></a>

<a id="run-from-source"></a>
## 从源码开发

请使用本仓库构建团战版。官方 npm 包启动的是标准 DeepSeek Harness，不包含这些定制。[开发指南](docs/development.zh.md)介绍环境准备；本仓库要求 Node.js `^22.19.0 || >=24.0.0` 和 pnpm `11.7.0`。

在仓库根目录运行：

```sh
pnpm install
pnpm run build
```

随后按[团战版 profile（配置组合）说明](packages/experimental/team-battle-profile/README.zh.md#use-this-package)启动 Web 客户端，或按 [macOS 构建指南](apps/macos/README.zh.md)构建原生应用。运行 agent（智能体）前，请阅读[安全说明](SAFETY.zh.md)。

<a id="source-map"></a>
### 源码入口

| 模块 | 说明 |
| --- | --- |
| 团队界面与协作流程 | [客户端](packages/experimental/client-ui-team-battle/README.zh.md) |
| 项目、成员、任务、文件与验收 | [团队服务](packages/experimental/team-battle/README.zh.md) |
| 共享服务器与 HTTP 通信 | [服务器部署](packages/experimental/team-battle-connector-http/README.zh.md) |
| 原生 macOS 应用 | [应用外壳](apps/macos/README.zh.md) |

参与贡献请阅读 [CONTRIBUTING.md](CONTRIBUTING.zh.md)、[架构指南](docs/architecture.zh.md)与 [AGENTS.md](AGENTS.md)。团战版问题请提交到[本仓库](https://github.com/359392475-blue-sky/deepseek-team/issues)。早期浏览器原型保留在 [`legacy-prototype/`](legacy-prototype/)。

<a id="upstream-deepseek-harness"></a>
## 上游与许可证

上游 DeepSeek Harness 智能体框架由 [DeepSeek AI](https://deepseek.com) 开发，基于 [Cordis](https://github.com/cordiverse/cordis) 构建。插件架构与通用功能详见[上游文档](https://deepseek-harness.github.io/deepseek-harness/)。

<a id="license"></a>

本项目采用 [MIT 许可证](LICENSE)开源，保留上游版权声明。第三方组件遵循各自的许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
