import AppKit
import Darwin
import Foundation

/// Owns the bundled CLI process and projects its lifecycle to the native shell.
@MainActor
public final class HarnessLauncher: ObservableObject {
  public static let shared = HarnessLauncher()

  @Published public private(set) var phase: LauncherPhase = .idle {
    didSet {
      guard phase != oldValue else { return }
      phaseObserver?(phase)
    }
  }
  @Published public private(set) var recentLog = ""
  @Published public var pageTitle = "DeepSeek Harness 团战版"
  /// Monotonic identity used to replace the mounted WebKit view.
  @Published public private(set) var interfaceReloadRequestID: UInt = 0
  /// Recoverable native error shown after automatic WebKit recovery is exhausted.
  @Published public private(set) var embeddedBrowserFailure: EmbeddedBrowserFailure?

  public var currentWorkspace: URL? {
    switch phase {
    case let .starting(workspace, _), let .ready(workspace, _): workspace
    case let .failed(workspace, _): workspace
    case .idle, .choosing, .stopping: lastWorkspace
    }
  }

  public var readyURL: URL? {
    guard case let .ready(_, url) = phase else { return nil }
    return url
  }

  public var isProcessRunning: Bool { process?.isRunning == true }
  public var canStop: Bool {
    workspacePanel == nil && hasManagedProcess && !terminationRequested
  }
  public var hasManagedProcess: Bool {
    process != nil || runEventTask != nil || finalizationTask != nil
  }
  public var isChoosingWorkspace: Bool { workspacePanel != nil }
  public var canStart: Bool {
    guard !hasManagedProcess, workspacePanel == nil else { return false }
    return switch phase {
    case .idle, .failed: true
    case .choosing, .starting, .ready, .stopping: false
    }
  }
  public var canRestart: Bool {
    guard workspacePanel == nil,
          currentWorkspace != nil,
          finalizationTask == nil else {
      return false
    }
    return switch phase {
    case .idle, .ready, .failed: true
    case .choosing, .starting, .stopping: false
    }
  }
  /// Whether a mounted ready interface may be replaced without restarting Harness.
  public var canReloadInterface: Bool { readyURL != nil }
  public var canChooseWorkspace: Bool {
    if workspacePanel != nil { return true }
    guard finalizationTask == nil else { return false }
    return switch phase {
    case .idle, .ready, .failed: true
    case .choosing, .starting, .stopping: false
    }
  }
  public var logURL: URL { logWriter.fileURL }

  private let defaults: UserDefaults
  private let fileManager: FileManager
  private let logWriter: LauncherLogWriter
  private let runtimeResolver: @MainActor () throws -> LauncherRuntimeResources
  private let processGroupVerifier: @MainActor (Process) throws -> Int32
  private let gracefulStopTimeout: Duration
  private let stopPollInterval: Duration
  private let phaseObserver: (@MainActor (LauncherPhase) -> Void)?
  private var logBuffer = LauncherLogBuffer()
  private var process: Process?
  private var runContext: ProcessRunContext?
  private var runEventTask: Task<Void, Never>?
  private var finalizationTask: Task<Void, Never>?
  private var descendantMonitorTask: Task<Void, Never>?
  private var activeGeneration: UUID?
  private var processGroupID: Int32?
  private var managedDescendants: Set<ManagedProcessIdentity> = []
  private var terminationRecord: RunTermination?
  private var requestedStopGeneration: UUID?
  private var startupFailureMessage: String?
  private var workspacePanel: NSOpenPanel?
  private var attemptedPort = 0
  private var retriedDynamicPort = false
  private var automaticRestartUsed = false
  private var lastWorkspace: URL?
  private var pendingWorkspace: URL?
  private var hasPromptedThisProcess = false
  private var terminationRequested = false
  private var reportedLogWriteFailure = false

  private static let portKey = "DeepSeekHarnessTeamBattlePreferredPort"

  public init(
    defaults: UserDefaults = .standard,
    fileManager: FileManager = .default,
    logWriter: LauncherLogWriter? = nil,
    runtimeResolver: (@MainActor () throws -> LauncherRuntimeResources)? = nil,
    processGroupVerifier: (@MainActor (Process) throws -> Int32)? = nil,
    gracefulStopTimeout: Duration = .seconds(6),
    stopPollInterval: Duration = .milliseconds(100),
    phaseObserver: (@MainActor (LauncherPhase) -> Void)? = nil
  ) {
    precondition(gracefulStopTimeout > .zero)
    precondition(stopPollInterval > .zero)
    self.defaults = defaults
    self.fileManager = fileManager
    self.logWriter = logWriter ?? .standard()
    self.runtimeResolver = runtimeResolver ?? Self.bundledRuntimeResources
    self.processGroupVerifier = processGroupVerifier ?? Self.verifiedProcessGroupID
    self.gracefulStopTimeout = gracefulStopTimeout
    self.stopPollInterval = stopPollInterval
    self.phaseObserver = phaseObserver
  }

  /// Present the required fresh-process workspace prompt at most once.
  public func promptForWorkspaceOnFreshLaunch() {
    guard !hasPromptedThisProcess else { return }
    hasPromptedThisProcess = true
    chooseWorkspace()
  }

  /// Present a native directory picker and start or restart with its selection.
  public func chooseWorkspace() {
    if let workspacePanel {
      workspacePanel.makeKeyAndOrderFront(nil)
      return
    }
    guard canChooseWorkspace else { return }
    let previous = phase
    phase = phaseWhileWorkspacePickerIsOpen(
      previous: previous,
      processIsRunning: process?.isRunning == true
    )
    let panel = NSOpenPanel()
    panel.title = "选择 DeepSeek Harness 团战版项目"
    panel.message = "所选目录将作为团战 Harness 的工作目录。"
    panel.prompt = "选择项目"
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.allowsMultipleSelection = false
    panel.canCreateDirectories = true
    workspacePanel = panel
    panel.begin { [weak self] response in
      Task { @MainActor in
        guard let self else { return }
        guard self.workspacePanel === panel else { return }
        self.workspacePanel = nil
        guard response == .OK, let url = panel.url else {
          guard self.phase == previous || self.phase == .choosing else { return }
          self.phase = phaseAfterWorkspaceSelectionCancelled(
            previous: previous,
            processIsRunning: self.process?.isRunning == true
          )
          return
        }
        if self.hasManagedProcess {
          self.pendingWorkspace = url
          await self.stopProcess()
        } else {
          self.start(workspace: url)
        }
      }
    }
  }

  /// Start Harness in the supplied project using the preferred fixed port.
  public func start(workspace: URL? = nil) {
    guard workspacePanel == nil else { return }
    guard !hasManagedProcess else { return }
    guard let workspace = workspace ?? lastWorkspace else {
      chooseWorkspace()
      return
    }
    lastWorkspace = workspace
    retriedDynamicPort = false
    automaticRestartUsed = false
    let preferred = defaults.integer(forKey: Self.portKey)
    launch(workspace: workspace, port: preferred == 0 ? 3_080 : preferred)
  }

  /// Stop the current child without quitting the native application.
  public func stop() {
    guard workspacePanel == nil else { return }
    pendingWorkspace = nil
    Task { await stopProcess() }
  }

  /// Restart in the current workspace after graceful disposal.
  public func restart() {
    guard workspacePanel == nil else { return }
    guard let workspace = currentWorkspace else {
      chooseWorkspace()
      return
    }
    guard hasManagedProcess else {
      start(workspace: workspace)
      return
    }
    pendingWorkspace = workspace
    Task { await stopProcess() }
  }

  /// Replace the mounted WebKit view without restarting the Harness process.
  public func reloadInterface() {
    guard canReloadInterface else { return }
    embeddedBrowserFailure = nil
    interfaceReloadRequestID &+= 1
    appendLog("launcher: interface reload requested\n")
  }

  /// Record a one-shot automatic renderer recovery without logging its URL or error text.
  public func recordEmbeddedBrowserAutomaticReload(
    kind: EmbeddedBrowserFailureKind,
    errorCode: Int?
  ) {
    guard readyURL != nil else { return }
    appendLog(
      "launcher: embedded browser \(kind.rawValue); reloading interface automatically"
        + Self.browserErrorCodeSuffix(errorCode) + "\n"
    )
  }

  /// Present a recoverable renderer failure and log only its category and numeric code.
  public func reportEmbeddedBrowserFailure(
    kind: EmbeddedBrowserFailureKind,
    errorCode: Int?
  ) {
    guard readyURL != nil, embeddedBrowserFailure == nil else { return }
    embeddedBrowserFailure = EmbeddedBrowserFailure(kind: kind, errorCode: errorCode)
    appendLog(
      "launcher: embedded browser recovery failed (\(kind.rawValue)"
        + Self.browserErrorCodeSuffix(errorCode) + ")\n"
    )
  }

  /// Stop the child before AppKit completes application termination.
  public func stopForApplicationTermination() async {
    terminationRequested = true
    pendingWorkspace = nil
    workspacePanel?.cancel(nil)
    workspacePanel = nil
    await stopProcess()
  }

  private func launch(workspace: URL, port: Int) {
    embeddedBrowserFailure = nil
    do {
      let resources = try runtimeResolver()
      guard fileManager.isExecutableFile(atPath: resources.node.path) else {
        throw LauncherError.missingRuntime(resources.node.path)
      }
      guard fileManager.fileExists(atPath: resources.entry.path) else {
        throw LauncherError.missingRuntime(resources.entry.path)
      }

      attemptedPort = port
      let child = Process()
      let stdout = Pipe()
      let stderr = Pipe()
      let generation = UUID()
      let context = try ProcessRunContext(
        standardOutput: stdout,
        standardError: stderr,
        identifier: generation,
        outputSink: { [logWriter] text in
          do {
            try logWriter.append(text)
            return nil
          } catch {
            return (error as NSError).code
          }
        }
      )
      child.executableURL = resources.node
      child.arguments = [
        "--expose-internals",
        resources.entry.path,
        "--profile", "team-battle",
        "--host", "127.0.0.1",
        "--port", String(port),
        "--no-open",
      ]
      child.currentDirectoryURL = workspace
      child.environment = launcherEnvironment(
        base: ProcessInfo.processInfo.environment,
        bundledNodeDirectory: resources.node.deletingLastPathComponent().path,
        dshHome: teamBattleDshHome(fileManager: fileManager).path
      )
      child.standardOutput = stdout
      child.standardError = stderr
      child.terminationHandler = { [weak context] terminated in
        context?.processTerminated(status: terminated.terminationStatus)
      }

      process = child
      runContext = context
      activeGeneration = generation
      processGroupID = nil
      terminationRecord = nil
      requestedStopGeneration = nil
      startupFailureMessage = nil
      reportedLogWriteFailure = false
      runEventTask = Task { @MainActor [weak self, context] in
        for await event in context.events {
          guard let self else { return }
          self.receive(event, generation: generation)
        }
      }
      phase = .starting(workspace: workspace, port: port)
      appendLog("launcher: starting workspace \(workspace.path), port \(port)\n")
      context.startReading()
      try child.run()
      captureManagedDescendants(rootPID: child.processIdentifier)
      startDescendantMonitor(generation: generation, rootPID: child.processIdentifier)
      processGroupID = try processGroupVerifier(child)
    } catch {
      if let process,
         process.processIdentifier > 1,
         let generation = activeGeneration {
        startupFailureMessage = error.localizedDescription
        appendLog("launcher: start failed: \(error.localizedDescription)\n")
        beginFinalization(generation: generation, requestedStop: true)
        return
      }
      cleanupActiveProcessHandles()
      phase = .failed(workspace: workspace, message: error.localizedDescription)
      appendLog("launcher: start failed: \(error.localizedDescription)\n")
    }
  }

  private func receive(_ event: ProcessRunEvent, generation: UUID) {
    guard activeGeneration == generation else { return }
    switch event {
    case let .output(text, _, readyURL, logWriteFailureCode):
      appendMemoryLog(text)
      reportLogWriteFailureIfNeeded(logWriteFailureCode)
      guard case let .starting(workspace, _) = phase, let readyURL else { return }
      if let port = readyURL.port {
        defaults.set(port, forKey: Self.portKey)
      }
      phase = .ready(workspace: workspace, url: teamSpaceURL(from: readyURL))
    case let .terminated(status, standardError, logWriteFailureCode):
      reportLogWriteFailureIfNeeded(logWriteFailureCode)
      didTerminate(generation: generation, status: status, standardError: standardError)
    }
  }

  private func appendLog(_ text: String) {
    appendMemoryLog(text)
    do {
      try logWriter.append(text)
    } catch {
      appendMemoryLog("launcher: log write failed: \(error.localizedDescription)\n")
    }
  }

  private func appendMemoryLog(_ text: String) {
    logBuffer.append(text)
    recentLog = logBuffer.displayText
  }

  private func reportLogWriteFailureIfNeeded(_ code: Int?) {
    guard let code, !reportedLogWriteFailure else { return }
    reportedLogWriteFailure = true
    appendMemoryLog("launcher: log write failed (error \(code))\n")
  }

  private static func browserErrorCodeSuffix(_ code: Int?) -> String {
    code.map { ", error \($0)" } ?? ""
  }

  /// Record a download failure without writing its URL or response details to disk.
  public func recordDownloadFailure(code: Int) {
    appendLog("launcher: download failed (error \(code))\n")
  }

  /// Fail closed when WebKit cannot install the exact-origin network rules.
  public func reportEmbeddedBrowserIsolationFailure(code: Int) {
    guard hasManagedProcess, startupFailureMessage == nil else { return }
    startupFailureMessage = "无法启用内嵌浏览器的本机网络隔离（错误 \(code)）。"
    appendLog("launcher: embedded browser isolation failed (error \(code))\n")
    Task { await stopProcess() }
  }

  private func didTerminate(generation: UUID, status: Int32, standardError: String) {
    guard activeGeneration == generation else { return }
    terminationRecord = RunTermination(
      previousPhase: phase,
      workspace: currentWorkspace,
      status: status,
      standardError: standardError
    )
    let requested = requestedStopGeneration == generation
      || terminationRequested
      || pendingWorkspace != nil
    beginFinalization(generation: generation, requestedStop: requested)
  }

  private func stopProcess() async {
    guard let generation = activeGeneration else {
      cleanupActiveProcessHandles()
      phase = .idle
      return
    }
    let task = beginFinalization(generation: generation, requestedStop: true)
    await task.value
  }

  @discardableResult
  private func beginFinalization(
    generation: UUID,
    requestedStop: Bool
  ) -> Task<Void, Never> {
    if requestedStop {
      requestedStopGeneration = generation
    }
    phase = .stopping
    if let finalizationTask { return finalizationTask }
    let task = Task { @MainActor [weak self] in
      guard let self else { return }
      await self.finalizeRun(generation: generation)
    }
    finalizationTask = task
    return task
  }

  private func finalizeRun(generation: UUID) async {
    guard activeGeneration == generation, let process else { return }
    let eventTask = runEventTask
    let groupID = processGroupID
    let requestedStop = requestedStopGeneration == generation || terminationRequested
    if process.isRunning {
      captureManagedDescendants(rootPID: process.processIdentifier)
    }
    descendantMonitorTask?.cancel()
    descendantMonitorTask = nil
    if process.isRunning, requestedStop {
      process.terminate()
    } else if !process.isRunning,
              let groupID,
              processGroupExists(groupID) {
      signalProcessGroup(groupID, signal: SIGTERM)
    }
    if !process.isRunning, !requestedStop {
      signalManagedDescendants(signal: SIGTERM)
    }

    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: gracefulStopTimeout)
    while clock.now < deadline {
      if process.isRunning {
        captureManagedDescendants(rootPID: process.processIdentifier)
      }
      let groupIsRunning = groupID.map(processGroupExists) ?? process.isRunning
      let detachedProcessesAreRunning = managedDescendants.contains(where: identityIsAlive)
      if !process.isRunning, !groupIsRunning, !detachedProcessesAreRunning { break }
      try? await Task.sleep(for: stopPollInterval)
    }

    let groupIsRunning = groupID.map(processGroupExists) ?? false
    let detachedProcessesAreRunning = managedDescendants.contains(where: identityIsAlive)
    if groupIsRunning || process.isRunning || detachedProcessesAreRunning {
      appendLog("launcher: graceful stop timed out; force stopping managed processes\n")
      if let groupID, groupIsRunning {
        signalProcessGroup(groupID, signal: SIGKILL)
      } else if process.isRunning {
        Darwin.kill(process.processIdentifier, SIGKILL)
      }
      signalManagedDescendants(signal: SIGKILL)
    }

    let forceDeadline = clock.now.advanced(by: .seconds(1))
    while clock.now < forceDeadline {
      let groupStillRunning = groupID.map(processGroupExists) ?? false
      let detachedProcessesStillRunning = managedDescendants.contains(where: identityIsAlive)
      if !process.isRunning, !groupStillRunning, !detachedProcessesStillRunning { break }
      try? await Task.sleep(for: .milliseconds(25))
    }
    await eventTask?.value
    completeFinalization(generation: generation)
  }

  private func completeFinalization(generation: UUID) {
    guard activeGeneration == generation else { return }
    let record = terminationRecord
    let wasRequested = requestedStopGeneration == generation
    let startupFailureMessage = startupFailureMessage
    let pending = pendingWorkspace
    pendingWorkspace = nil
    cleanupProcessHandles(generation: generation)

    if terminationRequested {
      phase = .idle
      return
    }
    if let pending {
      start(workspace: pending)
      return
    }
    if let startupFailureMessage {
      phase = .failed(workspace: lastWorkspace, message: startupFailureMessage)
      return
    }
    if wasRequested {
      phase = .idle
      return
    }
    if let record,
       case .starting = record.previousPhase,
       let workspace = record.workspace,
       shouldRetryWithDynamicPort(
         attemptedPort: attemptedPort,
         alreadyRetried: retriedDynamicPort,
         standardError: record.standardError
       ) {
      retriedDynamicPort = true
      appendLog("launcher: preferred port unavailable; retrying with a dynamic port\n")
      launch(workspace: workspace, port: 0)
      return
    }
    if let record,
       case .ready = record.previousPhase,
       let workspace = record.workspace,
       !automaticRestartUsed {
      automaticRestartUsed = true
      retriedDynamicPort = false
      appendLog("launcher: service exited after readiness; restarting once\n")
      launch(workspace: workspace, port: attemptedPort)
      return
    }
    let status = record?.status ?? process?.terminationStatus ?? -1
    phase = .failed(
      workspace: record?.workspace ?? lastWorkspace,
      message: automaticRestartUsed
        ? "Harness 服务再次退出（状态码 \(status)）。自动恢复已停止，请重试或查看启动日志。"
        : "Harness 已退出（状态码 \(status)）。请重试或查看启动日志。"
    )
  }

  private func cleanupProcessHandles(generation: UUID) {
    guard activeGeneration == generation else { return }
    runContext = nil
    runEventTask = nil
    finalizationTask = nil
    descendantMonitorTask?.cancel()
    descendantMonitorTask = nil
    activeGeneration = nil
    processGroupID = nil
    managedDescendants.removeAll()
    terminationRecord = nil
    requestedStopGeneration = nil
    startupFailureMessage = nil
    reportedLogWriteFailure = false
    process = nil
  }

  private func cleanupActiveProcessHandles() {
    runContext?.cancel()
    runContext = nil
    runEventTask?.cancel()
    runEventTask = nil
    finalizationTask?.cancel()
    finalizationTask = nil
    descendantMonitorTask?.cancel()
    descendantMonitorTask = nil
    activeGeneration = nil
    processGroupID = nil
    managedDescendants.removeAll()
    terminationRecord = nil
    requestedStopGeneration = nil
    startupFailureMessage = nil
    reportedLogWriteFailure = false
    process = nil
  }

  private static func verifiedProcessGroupID(for process: Process) throws -> Int32 {
    let identifier = process.processIdentifier
    let groupID = Darwin.getpgid(identifier)
    if groupID == identifier { return identifier }
    if groupID == -1, errno == ESRCH, !process.isRunning { return identifier }
    throw LauncherError.processGroupUnavailable
  }

  private func processGroupExists(_ groupID: Int32) -> Bool {
    guard groupID > 1 else { return false }
    if Darwin.kill(-groupID, 0) == 0 { return true }
    return errno == EPERM
  }

  private func signalProcessGroup(_ groupID: Int32, signal: Int32) {
    guard groupID > 1 else { return }
    _ = Darwin.kill(-groupID, signal)
  }

  private func startDescendantMonitor(generation: UUID, rootPID: Int32) {
    descendantMonitorTask = Task { @MainActor [weak self] in
      guard let self else { return }
      while !Task.isCancelled,
            self.activeGeneration == generation,
            self.process?.isRunning == true {
        self.captureManagedDescendants(rootPID: rootPID)
        try? await Task.sleep(for: .milliseconds(100))
      }
    }
  }

  private func captureManagedDescendants(rootPID: Int32) {
    managedDescendants = Set(managedDescendants.filter(identityIsAlive))
    var pending = [rootPID]
    var seen = Set([rootPID])
    while let parent = pending.first {
      pending.removeFirst()
      for childPID in directChildProcessIDs(of: parent)
      where childPID > 1 && seen.insert(childPID).inserted {
        if let identity = processIdentity(childPID) {
          managedDescendants.insert(identity)
        }
        pending.append(childPID)
      }
    }
  }

  private func directChildProcessIDs(of parent: Int32) -> [Int32] {
    let requiredBytes = Darwin.proc_listpids(
      UInt32(PROC_PPID_ONLY),
      UInt32(bitPattern: parent),
      nil,
      0
    )
    guard requiredBytes > 0 else { return [] }
    let capacity = Int(requiredBytes) / MemoryLayout<pid_t>.stride + 16
    var identifiers = [pid_t](repeating: 0, count: capacity)
    let writtenBytes = identifiers.withUnsafeMutableBytes { bytes in
      Darwin.proc_listpids(
        UInt32(PROC_PPID_ONLY),
        UInt32(bitPattern: parent),
        bytes.baseAddress,
        Int32(bytes.count)
      )
    }
    guard writtenBytes > 0 else { return [] }
    return identifiers.prefix(Int(writtenBytes) / MemoryLayout<pid_t>.stride)
      .filter { $0 > 1 }
  }

  private func processIdentity(_ identifier: Int32) -> ManagedProcessIdentity? {
    var information = proc_bsdinfo()
    let size = MemoryLayout<proc_bsdinfo>.size
    let result = withUnsafeMutablePointer(to: &information) { pointer in
      Darwin.proc_pidinfo(identifier, PROC_PIDTBSDINFO, 0, pointer, Int32(size))
    }
    guard result == size else { return nil }
    return ManagedProcessIdentity(
      identifier: identifier,
      startSeconds: information.pbi_start_tvsec,
      startMicroseconds: information.pbi_start_tvusec
    )
  }

  private func identityIsAlive(_ identity: ManagedProcessIdentity) -> Bool {
    processIdentity(identity.identifier) == identity
  }

  private func signalManagedDescendants(signal: Int32) {
    for identity in managedDescendants where identityIsAlive(identity) {
      _ = Darwin.kill(identity.identifier, signal)
    }
  }

  private static func bundledRuntimeResources() throws -> LauncherRuntimeResources {
    guard let resources = Bundle.main.resourceURL else {
      throw LauncherError.missingRuntime("Contents/Resources")
    }
    let runtime = resources.appending(path: "runtime", directoryHint: .isDirectory)
    return LauncherRuntimeResources(
      node: runtime.appending(path: "bin/node"),
      entry: runtime.appending(path: "lib/bin.js")
    )
  }
}

private enum LauncherError: LocalizedError {
  case missingRuntime(String)
  case processGroupUnavailable

  var errorDescription: String? {
    switch self {
    case let .missingRuntime(path): "应用包缺少运行时文件：\(path)"
    case .processGroupUnavailable: "无法为 Harness 建立独立进程组。"
    }
  }
}

private struct RunTermination {
  let previousPhase: LauncherPhase
  let workspace: URL?
  let status: Int32
  let standardError: String
}

private struct ManagedProcessIdentity: Hashable {
  let identifier: Int32
  let startSeconds: UInt64
  let startMicroseconds: UInt64
}
