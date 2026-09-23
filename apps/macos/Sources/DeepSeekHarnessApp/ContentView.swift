import AppKit
import DeepSeekHarnessCore
import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var launcher: HarnessLauncher

  var body: some View {
    Group {
      switch launcher.phase {
      case .idle:
        WelcomeView(
          title: "选择一个项目开始",
          detail: "项目目录将成为 DeepSeek Harness 团战版的工作区。",
          primaryTitle: "选择项目…",
          primaryAction: launcher.chooseWorkspace
        )
      case .choosing:
        StatusView(title: "正在选择项目…", detail: "请选择一个文件夹，或取消返回。")
      case let .starting(workspace, port):
        StatusView(
          title: "正在启动 DeepSeek Harness 团战版…",
          detail: "\(workspace.path)\n端口：\(port == 0 ? "自动选择" : String(port))"
        )
      case let .ready(_, url):
        ZStack {
          HarnessWebView(
            url: url,
            pageTitle: $launcher.pageTitle
          )
          // A recovery request replaces the Web view so a wedged renderer and
          // its page heap are released without restarting the Harness process.
          .id(launcher.interfaceReloadRequestID)
          if let failure = launcher.embeddedBrowserFailure {
            WelcomeView(
              title: "界面需要重新加载",
              detail: embeddedBrowserFailureMessage(failure.kind),
              primaryTitle: "重新加载界面",
              primaryAction: launcher.reloadInterface,
              secondaryTitle: "重新启动服务",
              secondaryAction: launcher.restart,
              tertiaryTitle: "查看日志",
              tertiaryAction: { NSWorkspace.shared.open(launcher.logURL) }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .windowBackgroundColor))
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .stopping:
        StatusView(title: "正在停止 Harness…", detail: "正在保存会话并关闭受管进程。")
      case let .failed(_, message):
        WelcomeView(
          title: "Harness 服务不可用",
          detail: message,
          primaryTitle: "重试",
          primaryAction: launcher.restart,
          secondaryTitle: "更换项目…",
          secondaryAction: launcher.chooseWorkspace,
          tertiaryTitle: "查看日志",
          tertiaryAction: { NSWorkspace.shared.open(launcher.logURL) }
        )
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(nsColor: .windowBackgroundColor))
    .toolbar {
      ToolbarItemGroup(placement: .automatic) {
        Button {
          launcher.reloadInterface()
        } label: {
          Label("重新连接", systemImage: "arrow.clockwise")
        }
        .help("重新加载团队空间；出现连接异常或 Failed to fetch 时可重试。")
        .disabled(!launcher.canReloadInterface)
        Button {
          if let currentURL = launcher.readyURL { NSWorkspace.shared.open(currentURL) }
        } label: {
          Label("在浏览器中打开", systemImage: "safari")
        }
        .disabled(launcher.readyURL == nil)
      }
    }
    .task { launcher.promptForWorkspaceOnFreshLaunch() }
    .onChange(of: launcher.pageTitle) { _, title in
      NSApp.mainWindow?.title = title.isEmpty ? "DeepSeek Harness 团战版" : title
    }
  }
}

private func embeddedBrowserFailureMessage(_ kind: EmbeddedBrowserFailureKind) -> String {
  switch kind {
  case .contentProcessTerminated:
    "WebKit 渲染进程连续意外退出。可重新加载界面，或重新启动本机服务。"
  case .navigationFailed, .provisionalNavigationFailed:
    "内嵌界面连续加载失败。可重新加载界面，或重新启动本机服务。"
  }
}

private struct StatusView: View {
  let title: String
  let detail: String

  var body: some View {
    VStack(spacing: 18) {
      ProgressView().controlSize(.large)
      Text(title).font(.title2.weight(.semibold))
      Text(detail)
        .font(.callout)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .textSelection(.enabled)
    }
    .padding(40)
  }
}

private struct WelcomeView: View {
  let title: String
  let detail: String
  let primaryTitle: String
  let primaryAction: () -> Void
  var secondaryTitle: String?
  var secondaryAction: (() -> Void)?
  var tertiaryTitle: String?
  var tertiaryAction: (() -> Void)?

  var body: some View {
    VStack(spacing: 20) {
      Image(nsImage: NSApp.applicationIconImage)
        .resizable()
        .frame(width: 92, height: 92)
        .accessibilityHidden(true)
      Text(title).font(.largeTitle.weight(.semibold))
      Text(detail)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .textSelection(.enabled)
      HStack(spacing: 12) {
        Button(primaryTitle, action: primaryAction).buttonStyle(.borderedProminent)
        if let secondaryTitle, let secondaryAction {
          Button(secondaryTitle, action: secondaryAction)
        }
        if let tertiaryTitle, let tertiaryAction {
          Button(tertiaryTitle, action: tertiaryAction)
        }
      }
    }
    .frame(maxWidth: 620)
    .padding(48)
  }
}
