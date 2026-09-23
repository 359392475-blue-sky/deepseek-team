# Agent Note: 团战版原生 macOS 应用

Status: implemented

[English](2026-08-31-team-battle-native-macos-application.md) | 中文

## Problem

团战版项目空间需要一个双击即可启动、自主管理运行时、且不依赖开发预览进程存活的桌面产品。本机回环网页链接不能启动 Harness，不能在启动前选择工作目录，其临时服务器退出后就会失效。复用个人版 `DeepSeek Harness.app` 的名称或主目录还会覆盖原应用，或让两个产品竞争写入同一批设置、会话和存储文件。

DeepSeek Harness 通过携带 token 的本机回环就绪 URL 认证新的 Web 进程。原生载体必须把完整 URL 交给其私有 `WKWebView`，同时阻止 token 进入启动器界面或持久日志。

## Decision

**`DeepSeek Harness 团战版.app` 是一个拥有独立进程、Bundle ID、状态主目录、日志、安装目标和备份的 SwiftUI 应用。** 它与个人版并列安装在 `/Applications`，使用 `com.bluesky.deepseek-harness-team-battle`，并将 Harness 状态保存在 `~/Library/Application Support/DeepSeek Harness Team Battle`。用户选择的项目仍是子进程工作目录，因此其 `.env`、指令和工作区文件无需把凭据复制到应用 bundle 中就能使用。

**私有运行时入口在不修改公开 CLI profile 模板的前提下初始化团战版 profile。** 在把控制权交给普通 `dsh` 入口前，它会在缺失时创建由 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-experimental-team-battle-profile` 和 `@deepseek-ai/dsh-experimental-team-battle-web-profile` 组成的 `team-battle` profile。应用在精确的 `127.0.0.1` origin 上以 `--no-open` 启动 `dsh --profile team-battle`；两个团战版组合包因此作为真实 profile 层参与组装，它们的依赖回退也会包含后端、connector 和浏览器 client 包。这个私有部署根目录可以依赖实验性包，但发布家族发现和官方运行时依赖检查仍会阻止它们进入公开应用。

**启动器将已认证的就绪 URL 视为短期秘密。** 其增量解析器会等待并返回完整的 token URL，即使进程输出将其拆分到多个分片也一样。Web view 仅加载一次该 URL，以便服务器将 token 交换为 cookie。进程输出只有在有状态的逐行过滤器用固定脱敏值替换 token 值后，才会进入内存和文件日志；本机回环 origin 与端口会被保留用于诊断，但完整 token 或后续分片里的 token 尾部都不会被保留。浏览器导航与子资源继续受限于输出的本机回环 origin，而不是携带查询参数的 URL。

**应用仍是一个自包含的本地构建。** Bundle 包含固定的 arm64 Node 运行时、锁文件界定的生产依赖闭包、已构建的 Client 和 Host 产物、团战版各包、许可说明和原生外壳。构建、测试和安装都会验证源码 manifest，安装只会在确认团战版的原生可执行文件与内置 Node 进程已停止后，替换独立的团战版应用。应用资源保持封存，而不是原地更新。

共享项目行为仍由[团战版项目空间决策](2026-08-31-team-battle-shared-project-space.zh.md)定义。原生应用改变的是启动、打包和本地状态归属；它不会赋予娱乐伤害修改项目进度的权限。

## Verification

Swift 测试覆盖 profile 启动参数、完整与分片就绪 URL、token 脱敏、独立状态路径、进程生命周期、精确 origin WebKit 策略、渲染器恢复、文件面板、下载和安装预检。打包运行时测试会在临时主目录中启动真实 `team-battle` profile，验证其四层组合包与内置团战版 client，接收已认证的 HTTP 内容，并在不遗留监听端口或子进程的情况下退出。Bundle 检查还会在安装前验证源码新鲜度、依赖文件隔离、arm64 和 macOS 14 目标、原生裁剪以及完整的 ad-hoc 签名。

## Alternatives considered

**继续把浏览器预览当作产品。** 否决，因为预览 URL 依赖外部进程，也不提供双击即可启动的桌面生命周期。

**覆盖个人版 `DeepSeek Harness.app` 或共享 `~/.dsh`。** 否决，因为两个产品必须并存，并且并发进程不得写入同一批全局状态文件。独立状态意味着团战版凭据需要来自用户选择的项目 `.env`，或重新进行配置。

**将 `team-battle` 添加到公开 CLI 随附的 profile 模板。** 否决，因为官方 npm 产物会有意排除私有实验性包。一个指向不存在组合包的公开模板会成功初始化，却在模块解析时失败。

**在标准 `web` profile 之上传入两个松散 patch 文件。** 否决，因为 profile 层拥有模块回退修复。只从外部覆盖层命名团战版插件，无法可靠地使其私有包在已安装 profile 中可解析。

**把凭据复制进 bundle。** 否决，因为应用资源是可分发产物，而凭据始终属于用户状态。

## Consequences

用户会获得一个不依赖终端和预览进程存活、直接进入指定 profile，并能与个人版并存的原生团战版应用。已认证启动路径能在全新 WebKit 数据存储中工作，且不会持久化其 token。

该应用仅支持 Apple Silicon，因为内置 Node 与生产依赖闭包而体积较大，并且只用 ad-hoc 签名供本机使用。它是 Local Beta，不是经过公证、可直接分发的构建。新版 Harness 或团战版实现只会通过完整重建、测试和安装进入应用。独立主目录避免文件竞争，但不会自动继承个人版的设置、会话或凭据引用。
