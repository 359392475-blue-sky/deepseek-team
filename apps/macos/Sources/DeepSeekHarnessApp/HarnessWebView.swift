import AppKit
import DeepSeekHarnessCore
import SwiftUI
import WebKit

struct HarnessWebView: NSViewRepresentable {
  let url: URL
  @Binding var pageTitle: String

  func makeCoordinator() -> Coordinator {
    Coordinator(pageTitle: $pageTitle)
  }

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    context.coordinator.observeTitle(of: webView)
    context.coordinator.load(url, in: webView)
    return webView
  }

  func updateNSView(_ webView: WKWebView, context: Context) {
    context.coordinator.load(url, in: webView)
  }

  static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
    coordinator.stopObserving()
    webView.navigationDelegate = nil
    webView.uiDelegate = nil
  }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate, WKDownloadDelegate, WKUIDelegate {
    private var pageTitle: Binding<String>
    private var titleObservation: NSKeyValueObservation?
    private var loadTracker = WebLoadRequestTracker()
    private var activeDownloads: [ObjectIdentifier: ActiveDownload] = [:]
    private var activeSavePanels: [ObjectIdentifier: NSSavePanel] = [:]
    private var uploadPanel: NSOpenPanel?
    private var uploadCompletion: (@MainActor @Sendable ([URL]?) -> Void)?
    private var contentRuleTask: Task<Void, Never>?
    private var configuredPort: Int?
    private var compilingPort: Int?
    private var pendingURL: URL?
    private var recoveryPolicy = EmbeddedBrowserRecoveryPolicy()
    private var handledFailureNavigation: ObjectIdentifier?
    private var isTearingDown = false

    init(pageTitle: Binding<String>) {
      self.pageTitle = pageTitle
    }

    func observeTitle(of webView: WKWebView) {
      titleObservation = webView.observe(\.title, options: [.initial, .new]) { [weak self] _, change in
        let title = change.newValue ?? nil
        Task { @MainActor in self?.pageTitle.wrappedValue = title ?? "DeepSeek Harness 团战版" }
      }
    }

    func stopObserving() {
      titleObservation?.invalidate()
      titleObservation = nil
      isTearingDown = true
      contentRuleTask?.cancel()
      contentRuleTask = nil
      pendingURL = nil
      handledFailureNavigation = nil
      let savePanels = Array(activeSavePanels.values)
      activeSavePanels.removeAll()
      for panel in savePanels {
        panel.cancel(nil)
      }
      if let uploadPanel {
        completeUploadPanel(with: nil)
        uploadPanel.cancel(nil)
      }
      let downloads = Array(activeDownloads)
      for (identifier, active) in downloads {
        active.download.cancel { [self] _ in
          discardDownload(identifier: identifier)
        }
      }
    }

    func load(_ url: URL, in webView: WKWebView) {
      guard !isTearingDown,
            url.scheme == "http",
            url.host == "127.0.0.1",
            let port = url.port else {
        return
      }
      if recoveryPolicy.prepare(for: url) {
        handledFailureNavigation = nil
      }
      pendingURL = url
      if configuredPort == port {
        loadPendingURL(in: webView)
        return
      }
      guard compilingPort != port else { return }
      configureNetworkRules(for: url, port: port, in: webView)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      guard !isTearingDown else { return }
      handledFailureNavigation = nil
      pageTitle.wrappedValue = webView.title ?? "DeepSeek Harness 团战版"
    }

    func webView(
      _ webView: WKWebView,
      didFail navigation: WKNavigation!,
      withError error: Error
    ) {
      recover(
        from: .navigationFailed,
        error: error,
        navigation: navigation,
        in: webView
      )
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) {
      recover(
        from: .provisionalNavigationFailed,
        error: error,
        navigation: navigation,
        in: webView
      )
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
      recover(
        from: .contentProcessTerminated,
        error: nil,
        navigation: nil,
        in: webView
      )
    }

    func webView(
      _ webView: WKWebView,
      runOpenPanelWith parameters: WKOpenPanelParameters,
      initiatedByFrame frame: WKFrameInfo,
      completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void
    ) {
      guard !isTearingDown else {
        completionHandler(nil)
        return
      }
      if let uploadPanel {
        uploadPanel.makeKeyAndOrderFront(nil)
        completionHandler(nil)
        return
      }
      let panel = NSOpenPanel()
      panel.title = "选择附件"
      panel.prompt = "选择"
      panel.allowsMultipleSelection = parameters.allowsMultipleSelection
      panel.canChooseDirectories = parameters.allowsDirectories
      panel.canChooseFiles = !parameters.allowsDirectories
      panel.canCreateDirectories = false
      uploadPanel = panel
      uploadCompletion = completionHandler
      panel.begin { [weak self, weak panel] response in
        Task { @MainActor in
          guard let self, let panel, self.uploadPanel === panel else { return }
          self.completeUploadPanel(with: response == .OK ? panel.urls : nil)
        }
      }
    }

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
      guard let target = navigationAction.request.url else { return .cancel }
      if target.absoluteString == "about:blank" { return .allow }
      if let origin = loadTracker.lastRequestedURL,
         isAllowedHarnessBlobURL(target, origin: origin) {
        return navigationAction.shouldPerformDownload ? .download : .allow
      }
      if let origin = loadTracker.lastRequestedURL,
         isAllowedHarnessNavigation(target, origin: origin) {
        return navigationAction.shouldPerformDownload ? .download : .allow
      }
      let externalSchemes = ["http", "https", "mailto"]
      if navigationAction.navigationType == .linkActivated,
         let scheme = target.scheme,
         externalSchemes.contains(scheme) {
        NSWorkspace.shared.open(target)
      }
      return .cancel
    }

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationResponse: WKNavigationResponse
    ) async -> WKNavigationResponsePolicy {
      guard let target = navigationResponse.response.url,
            let origin = loadTracker.lastRequestedURL,
            isAllowedHarnessNavigation(target, origin: origin)
              || isAllowedHarnessBlobURL(target, origin: origin) else {
        return .cancel
      }
      return navigationResponse.canShowMIMEType ? .allow : .download
    }

    func webView(
      _ webView: WKWebView,
      navigationAction: WKNavigationAction,
      didBecome download: WKDownload
    ) {
      register(download)
    }

    func webView(
      _ webView: WKWebView,
      navigationResponse: WKNavigationResponse,
      didBecome download: WKDownload
    ) {
      register(download)
    }

    func download(
      _ download: WKDownload,
      decideDestinationUsing response: URLResponse,
      suggestedFilename: String
    ) async -> URL? {
      guard !isTearingDown else { return nil }
      let identifier = ObjectIdentifier(download)
      guard activeDownloads[identifier] != nil else { return nil }
      let panel = NSSavePanel()
      panel.nameFieldStringValue = suggestedFilename
      panel.canCreateDirectories = true
      activeSavePanels[identifier] = panel
      let response = panel.runModal()
      guard activeSavePanels.removeValue(forKey: identifier) === panel else { return nil }
      guard response == .OK, let finalURL = panel.url else {
        activeDownloads.removeValue(forKey: identifier)
        return nil
      }
      guard !isTearingDown, activeDownloads[identifier] != nil else { return nil }
      do {
        let destination = try makeNativeDownloadDestination(finalURL: finalURL)
        activeDownloads[identifier]?.destination = destination
        return destination.stagingURL
      } catch {
        activeDownloads.removeValue(forKey: identifier)
        showDownloadFailure(
          title: "无法准备下载",
          message: "无法在所选位置创建安全的临时文件，请选择其他保存位置。"
        )
        return nil
      }
    }

    func downloadDidFinish(_ download: WKDownload) {
      let identifier = ObjectIdentifier(download)
      guard let active = activeDownloads.removeValue(forKey: identifier),
            let destination = active.destination else {
        return
      }
      do {
        try commitNativeDownload(destination)
      } catch {
        try? discardNativeDownload(destination)
        HarnessLauncher.shared.recordDownloadFailure(code: (error as NSError).code)
        showDownloadFailure(
          title: "无法保存下载",
          message: "原文件未被修改。请选择其他保存位置后重试。"
        )
      }
    }

    func download(
      _ download: WKDownload,
      didFailWithError error: Error,
      resumeData: Data?
    ) {
      let identifier = ObjectIdentifier(download)
      if let destination = activeDownloads.removeValue(
        forKey: identifier
      )?.destination {
        try? discardNativeDownload(destination)
      }
      let code = (error as NSError).code
      guard !isTearingDown, code != NSURLErrorCancelled else { return }
      HarnessLauncher.shared.recordDownloadFailure(code: code)
      showDownloadFailure(
        title: "下载失败",
        message: "文件没有保存。请重试或查看启动日志。"
      )
    }

    private func showDownloadFailure(title: String, message: String) {
      let alert = NSAlert()
      alert.alertStyle = .warning
      alert.messageText = title
      alert.informativeText = message
      alert.addButton(withTitle: "好")
      alert.runModal()
    }

    private func configureNetworkRules(for origin: URL, port: Int, in webView: WKWebView) {
      contentRuleTask?.cancel()
      webView.stopLoading()
      webView.configuration.userContentController.removeAllContentRuleLists()
      configuredPort = nil
      compilingPort = port
      do {
        let json = try harnessContentRuleListJSON(origin: origin)
        let identifier = "com.bluesky.deepseek-harness-team-battle.loopback.\(port)"
        contentRuleTask = Task { @MainActor [weak self, weak webView] in
          guard let self, let webView else { return }
          do {
            guard let rules = try await WKContentRuleListStore.default().compileContentRuleList(
              forIdentifier: identifier,
              encodedContentRuleList: json
            ) else {
              throw CocoaError(.coderInvalidValue)
            }
            try Task.checkCancellation()
            guard !self.isTearingDown, self.compilingPort == port else { return }
            webView.configuration.userContentController.add(rules)
            self.configuredPort = port
            self.compilingPort = nil
            self.contentRuleTask = nil
            self.loadPendingURL(in: webView)
          } catch is CancellationError {
            return
          } catch {
            guard !Task.isCancelled, self.compilingPort == port else { return }
            self.failNetworkRuleConfiguration(error)
          }
        }
      } catch {
        failNetworkRuleConfiguration(error)
      }
    }

    private func loadPendingURL(in webView: WKWebView) {
      guard let pendingURL, pendingURL.port == configuredPort else { return }
      guard loadTracker.shouldLoad(pendingURL) else { return }
      webView.load(URLRequest(url: pendingURL))
    }

    private func recover(
      from kind: EmbeddedBrowserFailureKind,
      error: Error?,
      navigation: WKNavigation?,
      in webView: WKWebView
    ) {
      guard !isTearingDown, !isExpectedNavigationInterruption(error) else { return }
      if let navigation {
        let identifier = ObjectIdentifier(navigation)
        guard handledFailureNavigation != identifier else { return }
        handledFailureNavigation = identifier
      }
      let code = error.map { ($0 as NSError).code }
      switch recoveryPolicy.actionAfterFailure() {
      case .reloadFromOrigin:
        HarnessLauncher.shared.recordEmbeddedBrowserAutomaticReload(
          kind: kind,
          errorCode: code
        )
        guard reloadFromOriginOrLoad(in: webView) != nil else {
          HarnessLauncher.shared.reportEmbeddedBrowserFailure(
            kind: kind,
            errorCode: code
          )
          return
        }
      case .presentFailure:
        HarnessLauncher.shared.reportEmbeddedBrowserFailure(
          kind: kind,
          errorCode: code
        )
      }
    }

    @discardableResult
    private func reloadFromOriginOrLoad(in webView: WKWebView) -> WKNavigation? {
      guard let pendingURL,
            configuredPort == pendingURL.port else {
        return nil
      }
      if let current = webView.url,
         isAllowedHarnessNavigation(current, origin: pendingURL),
         let navigation = webView.reloadFromOrigin() {
        return navigation
      }
      return webView.load(URLRequest(url: pendingURL))
    }

    private func isExpectedNavigationInterruption(_ error: Error?) -> Bool {
      guard let error = error as NSError? else { return false }
      return (error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled)
        || (error.domain == WKError.errorDomain
          && error.code == WebKitErrorFrameLoadInterruptedByPolicyChange)
    }

    private func failNetworkRuleConfiguration(_ error: Error) {
      guard !isTearingDown else { return }
      compilingPort = nil
      contentRuleTask = nil
      pendingURL = nil
      HarnessLauncher.shared.reportEmbeddedBrowserIsolationFailure(
        code: (error as NSError).code
      )
    }

    private func completeUploadPanel(with urls: [URL]?) {
      let completion = uploadCompletion
      uploadCompletion = nil
      uploadPanel = nil
      completion?(urls)
    }

    private func register(_ download: WKDownload) {
      guard !isTearingDown else {
        download.cancel(nil)
        return
      }
      let identifier = ObjectIdentifier(download)
      if activeDownloads[identifier] == nil {
        activeDownloads[identifier] = ActiveDownload(download: download)
      }
      download.delegate = self
    }

    private func discardDownload(identifier: ObjectIdentifier) {
      guard let destination = activeDownloads.removeValue(
        forKey: identifier
      )?.destination else {
        return
      }
      try? discardNativeDownload(destination)
    }

    private struct ActiveDownload {
      let download: WKDownload
      var destination: NativeDownloadDestination?
    }
  }
}
