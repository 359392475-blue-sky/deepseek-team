import AppKit
import DeepSeekHarnessCore
import SwiftUI

@main
struct DeepSeekHarnessApplication: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var launcher = HarnessLauncher.shared

  var body: some Scene {
    Window("DeepSeek Harness 团战版", id: "main") {
      ContentView()
        .environmentObject(launcher)
        .frame(minWidth: 900, minHeight: 620)
    }
    .defaultSize(width: 1_260, height: 820)
    .commands {
      HarnessCommands(launcher: launcher)
    }
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  private var replyingToTermination = false

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    false
  }

  func applicationShouldHandleReopen(
    _ sender: NSApplication,
    hasVisibleWindows flag: Bool
  ) -> Bool {
    if !flag {
      sender.windows.first?.makeKeyAndOrderFront(nil)
    }
    return true
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    let launcher = HarnessLauncher.shared
    if replyingToTermination { return .terminateLater }
    guard launcher.hasManagedProcess else { return .terminateNow }
    replyingToTermination = true
    Task { @MainActor in
      await launcher.stopForApplicationTermination()
      sender.reply(toApplicationShouldTerminate: true)
    }
    return .terminateLater
  }
}

private struct HarnessCommands: Commands {
  @ObservedObject var launcher: HarnessLauncher

  var body: some Commands {
    CommandGroup(replacing: .appInfo) {
      Button("关于 DeepSeek Harness 团战版") {
        let version = Bundle.main.object(forInfoDictionaryKey: "DSHFullVersion") as? String
        NSApp.orderFrontStandardAboutPanel(options: [
          .applicationName: "DeepSeek Harness 团战版",
          .applicationVersion: version ?? "Developer Preview",
        ])
      }
    }
    CommandMenu("运行") {
      Button("启动") { launcher.start() }
        .disabled(!launcher.canStart)
      Button("停止") { launcher.stop() }
        .disabled(!launcher.canStop)
      Button("重新启动") { launcher.restart() }
        .disabled(!launcher.canRestart)
      Button("重新加载界面") { launcher.reloadInterface() }
        .keyboardShortcut("r", modifiers: .command)
        .disabled(!launcher.canReloadInterface)
      Divider()
      Button("更换项目…") { launcher.chooseWorkspace() }
        .disabled(!launcher.canChooseWorkspace)
      Button("在浏览器中打开") {
        if let url = launcher.readyURL { NSWorkspace.shared.open(url) }
      }
      .disabled(launcher.readyURL == nil)
    }
    CommandGroup(after: .help) {
      Button("打开启动日志") { NSWorkspace.shared.open(launcher.logURL) }
      Button("打开团战版数据目录") {
        NSWorkspace.shared.open(
          teamBattleDshHome()
        )
      }
    }
  }
}
