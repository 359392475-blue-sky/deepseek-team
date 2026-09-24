# `@deepseek-ai/dsh-macos-team-battle-app`

[English](README.md) | 中文

这个私有 workspace（工作区）负责构建 Apple Silicon 版本的 `DeepSeek Harness 团战版.app`，产品版本为 `0.1.7-alpha.2`。原生 SwiftUI 外壳管理一个内置 Node.js 进程，并用一个 `WKWebView`（网页视图）显示现有团战版 Web 产品；它不会增加另一套 agent（智能体）运行时、传输协议或执行沙箱。

## 运行行为

每个全新的应用进程只显示一个原生目录选择器。所选目录同时是子进程工作目录、项目 `.env` 所在位置、默认 workspace（工作区）和指令根目录。从 ready（就绪）会话打开选择器时，当前会话会持续运行到用户确认另一个目录；取消操作会保留当前会话。关闭窗口不会停止 Harness，退出应用则会监管子进程完成关闭。

启动器按 `dsh --profile team-battle --host 127.0.0.1 --port <port> --no-open` 启动内置运行时。私有入口会先按以下顺序初始化 profile（配置）层，再导入真实 CLI（命令行程序）：

1. `@deepseek-ai/dsh-base`
2. `@deepseek-ai/dsh-web-app`
3. `@deepseek-ai/dsh-experimental-team-battle-profile`
4. `@deepseek-ai/dsh-experimental-team-battle-web-profile`

Profile 初始化只创建缺失文件，不会覆盖已有的 profile manifest（配置清单）或用户 patch（补丁）。应用把 `DSH_HOME` 固定为 `~/Library/Application Support/DeepSeek Harness Team Battle`，因此团战版的 profile、设置、凭据引用、会话和存储不会与个人版应用或 CLI 的 `~/.dsh` 共用；项目 `.env` 仍从用户选择的 workspace 读取。

启动器优先使用团战版单独保存的端口或 `3080`。端口被占用时只改用一次系统分配端口，绝不会终止占用目标端口的进程。应用只加载当前进程输出的完整 loopback readiness URL（本机回环就绪地址），保留 `/?token=...` 认证参数并添加 `#team`，直接进入团队空间。认证跳转会移除 token 查询参数，浏览器保留 fragment（片段）中的团队入口；通用认证处理器无需增加团战路由例外。Streaming filter（流式过滤器）会暂存未完成的就绪行，并在 stdout（标准输出）或 stderr（标准错误）进入界面与轮转文件日志前替换 token；即使 token 被拆在多个进程输出 chunk（分片）中也不会泄漏。完整认证地址只交给内嵌浏览器和用户显式执行的“在浏览器中打开”操作。这些操作读取当前就绪地址，因此重启会替换先前的端口与 token。启动日志以仅限所有者的权限写入 `~/Library/Logs/DeepSeek Harness Team Battle/launcher.log`，单文件达到 5 MB 时轮转并保留三份；界面日志最多保留 500 行且不超过 256 KB。

子进程运行在经过验证的独立进程组中。启动器采样后代进程身份，对已观察到的 detached child（分离子进程）进行 best-effort（尽力而为）清理，同时避免向复用后的 PID（进程标识）发送信号。停止和退出会先保留 Node 清理窗口，随后只强制停止已验证进程组以及身份仍匹配的已观察后代。输出管道采用 nonblocking（非阻塞）和单次读取上限，因此继承的管道句柄或持续输出不会无限推迟收尾。

Web 视图安装 fail-closed（失败即关闭）规则，把 HTTP、WebSocket、blob、导航和下载通信限制在就绪地址的 exact origin（精确来源）。用户主动点击的外部链接会在默认浏览器打开。文件选择和下载使用原生面板；下载先写入团战版专用的隐藏 staging（暂存）文件，WebKit 报告完成后才原子替换用户选择的目标。渲染或导航失败会自动重载一次，再次失败时提供重新加载、重启服务和查看日志操作。窗口工具栏也会在就绪时提供“重新连接”和“在浏览器中打开”；“重新连接”使用当前认证团队空间地址替换 Web 视图，也适用于未触发 WebKit 导航失败的页面内 `Failed to fetch` 错误。

服务在就绪后意外退出时，启动器会先等待旧进程组停止，再在同一工作区自动重启一次。再次退出会停止自动恢复，并提供重试、更换项目和查看日志操作。用户显式启动或重启会重新获得一次自动恢复机会；停止和退出不会重新启动服务。恢复不会重新提交用户请求或尚未完成的修改。

## 构建、测试与安装

构建环境必须是 Apple Silicon 上的 macOS 15 或更高版本，并提供 Swift、Node.js `v22.22.3`、pnpm 和 macOS 标准图标与签名工具。在仓库根目录运行：

```sh
pnpm run build:macos
pnpm run test:macos
pnpm run install:macos
```

`build:macos` 会清理并构建 Harness、打包发布族、从 lockfile（锁定文件）部署生产依赖闭包、复制团战版私有运行时入口、嵌入 arm64 Node、隔离所有常规运行时文件的共享 inode（索引节点）、只裁剪已确认的外来或不受支持原生文件，并用 ad-hoc identity（临时签名身份）签署 `dist/macos/DeepSeek Harness 团战版.app`。Source manifest（源码清单）覆盖 CLI、Web 应用、macOS 外壳、packages、vendor、Python、native、patches、scripts、snapshots、website 以及必要的根构建与法律文件，同时排除生成产物。原生源码、清单和构建脚本仍在覆盖范围内；`native/system` 与 `native/landlock-run` 下的生成构建目录和包内 `bin`/`lib` 输出均被排除。

`test:macos` 会验证源码新鲜度、Swift 行为、token 脱敏、运行时 inode 隔离、CLI 版本、四层团战 profile、团战 host（主机端）与 browser（浏览器端）产物、认证 HTTP 启动及页面中的团战客户端入口、原生架构、最低系统版本、关闭流程、裁剪结果和签名。

`install:macos` 只以 bundle identifier（应用标识）`com.bluesky.deepseek-harness-team-battle` 安装到 `/Applications/DeepSeek Harness 团战版.app`，绝不会替换 `/Applications/DeepSeek Harness.app`。可恢复备份位于 `~/Library/Application Support/DeepSeek Harness Team Battle/Backups`，并使用 `DeepSeek Harness Team Battle-*.app` 命名空间。安装器会拒绝运行中的目标、错误身份、符号链接、无效签名、陈旧源码、不安全的备份候选和可写的已安装资源；替换失败时会恢复并重新封装上一版团战应用。

## 安全与限制

内置服务只绑定到 `127.0.0.1`，`NSAllowsLocalNetworking` 是唯一的 App Transport Security（应用传输安全）例外。App Sandbox（应用沙箱）保持关闭，因为 coding agent（编码智能体）及其受管进程需要访问所选 workspace 和用户配置的工具；执行控制仍由 Harness 权限策略负责。

默认源码构建仅支持 arm64，使用 ad-hoc 签名供本地使用，不会执行 Developer ID 签名或 Apple notarization（公证）。单独分发的团战版 ZIP 内含已使用 Developer ID 签名并通过 Apple 公证的应用，详见[下载与安装入口](../../README.zh.md#start-team-battle)。已安装资源只读属于打包保护，并不是安全沙箱。更新时必须重新构建并测试完整应用包；不要原地修改已构建或正在运行的应用。
