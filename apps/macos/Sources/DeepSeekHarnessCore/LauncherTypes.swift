import Darwin
import Foundation

/// Locations of the bundled Node executable and CLI entry point.
public struct LauncherRuntimeResources: Sendable {
  public let node: URL
  public let entry: URL

  public init(node: URL, entry: URL) {
    self.node = node
    self.entry = entry
  }
}

enum ProcessRunEvent: Sendable {
  case output(
    text: String,
    isStandardError: Bool,
    readyURL: URL?,
    logWriteFailureCode: Int?
  )
  case terminated(
    status: Int32,
    standardError: String,
    logWriteFailureCode: Int?
  )
}

/// Serializes both output pipes with process termination and drains buffered bytes without waiting on descendants.
final class ProcessRunContext: @unchecked Sendable {
  let events: AsyncStream<ProcessRunEvent>

  private let continuation: AsyncStream<ProcessRunEvent>.Continuation
  private let standardOutput: FileHandle
  private let standardError: FileHandle
  private let queue: DispatchQueue
  private let standardOutputSource: DispatchSourceRead
  private let standardErrorSource: DispatchSourceRead
  private let outputSink: @Sendable (String) -> Int?
  private var parser = ReadinessParser()
  private var standardOutputRedactor = ReadinessOutputRedactor()
  private var standardErrorRedactor = ReadinessOutputRedactor()
  private var readyURL: URL?
  private var errorText = ""
  private var finished = false
  private var logWriteFailureCode: Int?

  init(
    standardOutput: Pipe,
    standardError: Pipe,
    identifier: UUID = UUID(),
    outputSink: @escaping @Sendable (String) -> Int? = { _ in nil }
  ) throws {
    let pair = AsyncStream<ProcessRunEvent>.makeStream(
      bufferingPolicy: .bufferingNewest(64)
    )
    events = pair.stream
    continuation = pair.continuation
    self.standardOutput = standardOutput.fileHandleForReading
    self.standardError = standardError.fileHandleForReading
    self.outputSink = outputSink
    queue = DispatchQueue(
      label: "com.bluesky.deepseek-harness-team-battle.output.\(identifier.uuidString)"
    )
    try Self.makeNonblocking(self.standardOutput)
    try Self.makeNonblocking(self.standardError)
    standardOutputSource = DispatchSource.makeReadSource(
      fileDescriptor: self.standardOutput.fileDescriptor,
      queue: queue
    )
    standardErrorSource = DispatchSource.makeReadSource(
      fileDescriptor: self.standardError.fileDescriptor,
      queue: queue
    )
  }

  func startReading() {
    standardOutputSource.setEventHandler { [weak self] in
      guard let self else { return }
      guard !self.finished else { return }
      if self.drainBufferedBytes(from: self.standardOutput, isStandardError: false) {
        self.standardOutputSource.cancel()
      }
    }
    standardErrorSource.setEventHandler { [weak self] in
      guard let self else { return }
      guard !self.finished else { return }
      if self.drainBufferedBytes(from: self.standardError, isStandardError: true) {
        self.standardErrorSource.cancel()
      }
    }
    standardOutputSource.resume()
    standardErrorSource.resume()
  }

  func processTerminated(status: Int32) {
    queue.async { [self] in
      guard !finished else { return }
      standardOutputSource.cancel()
      standardErrorSource.cancel()
      drainBufferedBytes(from: standardOutput, isStandardError: false)
      drainBufferedBytes(from: standardError, isStandardError: true)
      flushRedactors()
      finished = true
      continuation.yield(.terminated(
        status: status,
        standardError: errorText,
        logWriteFailureCode: logWriteFailureCode
      ))
      continuation.finish()
    }
  }

  func cancel() {
    queue.async { [self] in
      guard !finished else { return }
      finished = true
      standardOutputSource.cancel()
      standardErrorSource.cancel()
      continuation.finish()
    }
  }

  @discardableResult
  private func drainBufferedBytes(from handle: FileHandle, isStandardError: Bool) -> Bool {
    var remainingBytes = 256 * 1_024
    while remainingBytes > 0 {
      let (data, reachedEOF) = readAvailableBytes(
        from: handle,
        maximumBytes: remainingBytes
      )
      consume(data, isStandardError: isStandardError)
      if reachedEOF { return true }
      guard let data, !data.isEmpty else { return false }
      remainingBytes -= data.count
    }
    return false
  }

  private func readAvailableBytes(
    from handle: FileHandle,
    maximumBytes: Int
  ) -> (Data?, Bool) {
    var buffer = [UInt8](repeating: 0, count: min(64 * 1_024, maximumBytes))
    while true {
      let count = buffer.withUnsafeMutableBytes { bytes in
        Darwin.read(handle.fileDescriptor, bytes.baseAddress, bytes.count)
      }
      if count > 0 {
        return (Data(buffer.prefix(Int(count))), false)
      }
      if count == 0 { return (nil, true) }
      if errno == EINTR { continue }
      return (nil, false)
    }
  }

  private func consume(_ data: Data?, isStandardError: Bool) {
    guard let data,
          !data.isEmpty else {
      return
    }
    let rawText = String(decoding: data, as: UTF8.self)
    if !isStandardError, let parsedURL = parser.consume(rawText) {
      readyURL = parsedURL
    }
    let text = isStandardError
      ? standardErrorRedactor.consume(rawText)
      : standardOutputRedactor.consume(rawText)
    guard !text.isEmpty else { return }
    emit(text, isStandardError: isStandardError)
  }

  private func flushRedactors() {
    let output = standardOutputRedactor.finish()
    if !output.isEmpty { emit(output, isStandardError: false) }
    let error = standardErrorRedactor.finish()
    if !error.isEmpty { emit(error, isStandardError: true) }
  }

  private func emit(_ text: String, isStandardError: Bool) {
    if let code = outputSink(text), logWriteFailureCode == nil {
      logWriteFailureCode = code
    }
    if isStandardError {
      errorText.append(text)
      if errorText.utf8.count > 32_768 {
        errorText = String(errorText.suffix(16_384))
      }
    }
    continuation.yield(.output(
      text: text,
      isStandardError: isStandardError,
      readyURL: readyURL,
      logWriteFailureCode: logWriteFailureCode
    ))
  }

  private static func makeNonblocking(_ handle: FileHandle) throws {
    let descriptor = handle.fileDescriptor
    let flags = Darwin.fcntl(descriptor, F_GETFL)
    guard flags >= 0, Darwin.fcntl(descriptor, F_SETFL, flags | O_NONBLOCK) == 0 else {
      let code = POSIXErrorCode(rawValue: errno) ?? .EIO
      throw POSIXError(code)
    }
  }
}

/// User-visible lifecycle of the bundled Harness process.
public enum LauncherPhase: Equatable, Sendable {
  case idle
  case choosing
  case starting(workspace: URL, port: Int)
  case ready(workspace: URL, url: URL)
  case stopping
  case failed(workspace: URL?, message: String)

  /// Stable label used by diagnostics and the keyless lifecycle snapshot.
  public var snapshotName: String {
    switch self {
    case .idle: "idle"
    case .choosing: "choosing"
    case .starting: "starting"
    case .ready: "ready"
    case .stopping: "stopping"
    case .failed: "failed"
    }
  }
}

/// Incremental parser for the CLI readiness line.
public struct ReadinessParser: Sendable {
  private var buffer = ""

  public init() {}

  /// Append one output chunk and return the first complete loopback readiness URL.
  public mutating func consume(_ text: String) -> URL? {
    buffer.append(text)
    if buffer.utf8.count > 32_768 {
      buffer = String(buffer.suffix(16_384))
    }
    guard let range = buffer.range(
      of: #"dsh web: http://127\.0\.0\.1:[0-9]+/\?token=[A-Za-z0-9_-]+(?:[ \t]|\r?\n)"#,
      options: .regularExpression
    ) else {
      return nil
    }
    let match = String(buffer[range]).trimmingCharacters(in: .whitespacesAndNewlines)
    let prefix = "dsh web: "
    guard match.hasPrefix(prefix) else { return nil }
    let candidate = String(match.dropFirst(prefix.count))
    return URL(string: candidate)
  }
}

/// Select the Team Space root while retaining the current process authentication token.
public func teamSpaceURL(from readinessURL: URL) -> URL {
  var components = URLComponents(url: readinessURL, resolvingAgainstBaseURL: false)!
  components.fragment = "team"
  return components.url!
}

/// Streaming launcher-output filter that discards token values before logs or UI can observe them.
public struct ReadinessOutputRedactor: Sendable {
  private static let tokenMarkers = ["?token=", "&token="]
  private var pending = ""
  private var isDiscardingTokenValue = false

  public init() {}

  /// Append a process-output chunk and return only bytes safe for launcher logs and UI.
  public mutating func consume(_ text: String) -> String {
    pending.append(text)
    var result = ""
    while true {
      if isDiscardingTokenValue {
        guard let delimiter = pending.firstIndex(where: Self.isTokenDelimiter) else {
          pending = ""
          return result
        }
        pending.removeSubrange(..<delimiter)
        isDiscardingTokenValue = false
        continue
      }
      guard let markerRange = Self.firstTokenMarkerRange(in: pending) else {
        let retainedCount = Self.incompleteMarkerSuffixLength(in: pending)
        let retainedStart = pending.index(pending.endIndex, offsetBy: -retainedCount)
        result.append(contentsOf: pending[..<retainedStart])
        pending.removeSubrange(..<retainedStart)
        return result
      }
      result.append(contentsOf: pending[..<markerRange.upperBound])
      result.append("<redacted>")
      pending.removeSubrange(..<markerRange.upperBound)
      isDiscardingTokenValue = true
    }
  }

  /// Flush the final incomplete line after redacting any token it contains.
  public mutating func finish() -> String {
    defer {
      pending = ""
      isDiscardingTokenValue = false
    }
    return isDiscardingTokenValue ? "" : pending
  }

  private static func firstTokenMarkerRange(in text: String) -> Range<String.Index>? {
    tokenMarkers.compactMap { text.range(of: $0) }
      .min { $0.lowerBound < $1.lowerBound }
  }

  private static func incompleteMarkerSuffixLength(in text: String) -> Int {
    for count in stride(from: min(text.count, 6), through: 1, by: -1) {
      if tokenMarkers.contains(where: { text.hasSuffix($0.prefix(count)) }) {
        return count
      }
    }
    return 0
  }

  private static func isTokenDelimiter(_ character: Character) -> Bool {
    character == "&" || character == "#" || character.isWhitespace
  }
}

/// Deduplicates URLs handed to the embedded browser across SwiftUI view updates.
public struct WebLoadRequestTracker: Sendable {
  public private(set) var lastRequestedURL: URL?

  public init() {}

  /// Record a new requested URL and report whether the web view should load it.
  public mutating func shouldLoad(_ url: URL) -> Bool {
    guard lastRequestedURL != url else { return false }
    lastRequestedURL = url
    return true
  }
}

/// Sanitized categories for failures raised by the embedded WebKit renderer.
public enum EmbeddedBrowserFailureKind: String, Equatable, Sendable {
  case contentProcessTerminated = "content-process-terminated"
  case navigationFailed = "navigation-failed"
  case provisionalNavigationFailed = "provisional-navigation-failed"
}

/// User-visible embedded-browser failure without a URL or WebKit error text.
public struct EmbeddedBrowserFailure: Equatable, Sendable {
  /// Stable failure category safe to include in launcher diagnostics.
  public let kind: EmbeddedBrowserFailureKind
  /// Numeric WebKit/Foundation code, when the delegate supplies one.
  public let errorCode: Int?

  public init(kind: EmbeddedBrowserFailureKind, errorCode: Int?) {
    self.kind = kind
    self.errorCode = errorCode
  }
}

/// Recovery selected after an embedded-browser navigation or renderer failure.
public enum EmbeddedBrowserRecoveryAction: Equatable, Sendable {
  case reloadFromOrigin
  case presentFailure
}

/// Limits automatic WebKit recovery to one reload for each exact Harness origin.
public struct EmbeddedBrowserRecoveryPolicy: Sendable {
  private struct Origin: Equatable, Sendable {
    let scheme: String?
    let host: String?
    let port: Int?
  }

  private var origin: Origin?
  private var automaticReloadUsed = false

  public init() {}

  /// Reset the allowance only when the URL's scheme, host, or port changes.
  @discardableResult
  public mutating func prepare(for origin: URL) -> Bool {
    let next = Origin(scheme: origin.scheme, host: origin.host, port: origin.port)
    guard self.origin != next else { return false }
    self.origin = next
    automaticReloadUsed = false
    return true
  }

  /// Select one automatic reload, then require an explicit user recovery.
  public mutating func actionAfterFailure() -> EmbeddedBrowserRecoveryAction {
    guard !automaticReloadUsed else { return .presentFailure }
    automaticReloadUsed = true
    return .reloadFromOrigin
  }
}

/// Whether a navigation remains on the exact loopback origin emitted by Harness.
public func isAllowedHarnessNavigation(_ target: URL, origin: URL) -> Bool {
  guard origin.scheme == "http", origin.host == "127.0.0.1", origin.port != nil else {
    return false
  }
  return target.scheme == origin.scheme
    && target.host == origin.host
    && target.port == origin.port
}

/// Whether a blob URL embeds the exact loopback Harness origin.
public func isAllowedHarnessBlobURL(_ target: URL, origin: URL) -> Bool {
  guard target.scheme == "blob",
        target.absoluteString.hasPrefix("blob:"),
        let embedded = URL(string: String(target.absoluteString.dropFirst("blob:".count))) else {
    return false
  }
  return isAllowedHarnessNavigation(embedded, origin: origin)
}

/// Build a WebKit content-rule list that permits network access only to one Harness origin.
public func harnessContentRuleListJSON(origin: URL) throws -> String {
  guard origin.scheme == "http",
        origin.host == "127.0.0.1",
        let port = origin.port else {
    throw URLError(.unsupportedURL)
  }
  let loopback = "127[.]0[.]0[.]1:\(port)"
  let allowedFilters = [
    "^http://\(loopback)([/?#].*)?$",
    "^ws://\(loopback)([/?#].*)?$",
    "^blob:http://\(loopback)([/?#].*)?$",
    "^data:",
    "^about:blank$",
  ]
  let block: [String: Any] = [
    "trigger": ["url-filter": ".*"],
    "action": ["type": "block"],
  ]
  let exceptions = allowedFilters.map { filter -> [String: Any] in
    [
      "trigger": [
        "url-filter": filter,
        "url-filter-is-case-sensitive": true,
      ],
      "action": ["type": "ignore-previous-rules"],
    ]
  }
  let data = try JSONSerialization.data(
    withJSONObject: [block] + exceptions,
    options: [.sortedKeys]
  )
  guard let json = String(data: data, encoding: .utf8) else {
    throw CocoaError(.coderInvalidValue)
  }
  return json
}

/// Whether a failed fixed-port attempt may retry with an operating-system-selected port.
public func shouldRetryWithDynamicPort(
  attemptedPort: Int,
  alreadyRetried: Bool,
  standardError: String
) -> Bool {
  guard attemptedPort != 0, !alreadyRetried else { return false }
  let text = standardError.lowercased()
  return text.contains("eaddrinuse") || text.contains("address already in use")
}

/// State restored when the user cancels the workspace picker.
public func phaseAfterWorkspaceSelectionCancelled(
  previous: LauncherPhase,
  processIsRunning: Bool
) -> LauncherPhase {
  processIsRunning ? previous : .idle
}

/// Keep a live ready view mounted while its modeless workspace picker is open.
public func phaseWhileWorkspacePickerIsOpen(
  previous: LauncherPhase,
  processIsRunning: Bool
) -> LauncherPhase {
  processIsRunning ? previous : .choosing
}

/// A hidden same-directory download target and its user-selected final path.
public struct NativeDownloadDestination: Sendable {
  public let finalURL: URL
  public let stagingURL: URL
}

/// Create a nonexistent same-directory path that WebKit may write without replacing user data early.
public func makeNativeDownloadDestination(
  finalURL: URL,
  identifier: UUID = UUID()
) throws -> NativeDownloadDestination {
  guard finalURL.isFileURL, !finalURL.lastPathComponent.isEmpty else {
    throw CocoaError(.fileWriteUnsupportedScheme)
  }
  let stagingURL = finalURL.deletingLastPathComponent().appending(
    path: ".deepseek-harness-team-battle-\(identifier.uuidString).download"
  )
  var metadata = stat()
  let status = stagingURL.withUnsafeFileSystemRepresentation { path -> Int32 in
    guard let path else { return -1 }
    return Darwin.lstat(path, &metadata)
  }
  if status == 0 { throw POSIXError(.EEXIST) }
  guard errno == ENOENT else {
    throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
  }
  return NativeDownloadDestination(finalURL: finalURL, stagingURL: stagingURL)
}

/// Atomically replace the user-selected path after WebKit reports a complete download.
public func commitNativeDownload(_ destination: NativeDownloadDestination) throws {
  let finalParent = destination.finalURL.deletingLastPathComponent().standardizedFileURL
  let stagingParent = destination.stagingURL.deletingLastPathComponent().standardizedFileURL
  guard destination.finalURL.isFileURL,
        destination.stagingURL.isFileURL,
        finalParent == stagingParent else {
    throw CocoaError(.fileWriteUnsupportedScheme)
  }
  let status = destination.stagingURL.withUnsafeFileSystemRepresentation { stagingPath in
    destination.finalURL.withUnsafeFileSystemRepresentation { finalPath -> Int32 in
      guard let stagingPath, let finalPath else { return -1 }
      return Darwin.rename(stagingPath, finalPath)
    }
  }
  if status != 0 {
    throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
  }
}

/// Delete only the hidden partial download and never follow a symbolic link.
public func discardNativeDownload(_ destination: NativeDownloadDestination) throws {
  let status = destination.stagingURL.withUnsafeFileSystemRepresentation { path -> Int32 in
    guard let path else { return -1 }
    return Darwin.unlink(path)
  }
  if status == 0 || errno == ENOENT { return }
  throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
}

/// Environment inherited by the child after removing ambient Node loader injection.
public func launcherEnvironment(
  base: [String: String],
  bundledNodeDirectory: String,
  dshHome: String
) -> [String: String] {
  var result = base
  result.removeValue(forKey: "NODE_OPTIONS")
  result.removeValue(forKey: "NODE_PATH")

  let fixed = [
    bundledNodeDirectory,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ]
  let inherited = (base["PATH"] ?? "").split(separator: ":").map(String.init)
  var seen = Set<String>()
  result["PATH"] = (fixed + inherited)
    .filter { !$0.isEmpty && seen.insert($0).inserted }
    .joined(separator: ":")
  result["DSH_HOME"] = dshHome
  return result
}

/// Dedicated Harness home used by the Team Battle app instead of the personal CLI home.
public func teamBattleDshHome(fileManager: FileManager = .default) -> URL {
  fileManager.homeDirectoryForCurrentUser
    .appending(
      path: "Library/Application Support/DeepSeek Harness Team Battle",
      directoryHint: .isDirectory
    )
}

/// Bounded line buffer used by the launcher UI and tests.
public struct LauncherLogBuffer: Sendable {
  public let capacity: Int
  public let maximumBytes: Int
  public private(set) var lines: [String] = []
  private var partial = ""

  public init(capacity: Int = 500, maximumBytes: Int = 256 * 1_024) {
    precondition(capacity > 0)
    precondition(maximumBytes > 0)
    self.capacity = capacity
    self.maximumBytes = maximumBytes
  }

  public mutating func append(_ text: String) {
    partial.append(text)
    let pieces = partial.split(separator: "\n", omittingEmptySubsequences: false)
    if pieces.count > 1 {
      for piece in pieces.dropLast() {
        lines.append(boundedSuffix(String(piece), maximumBytes: maximumBytes))
      }
      partial = String(pieces.last ?? "")
    }
    partial = boundedSuffix(partial, maximumBytes: maximumBytes)
    if lines.count > capacity {
      lines.removeFirst(lines.count - capacity)
    }
    var retainedBytes = partial.utf8.count + lines.reduce(0) { $0 + $1.utf8.count + 1 }
    while retainedBytes > maximumBytes, !lines.isEmpty {
      retainedBytes -= lines.removeFirst().utf8.count + 1
    }
  }

  public var displayText: String {
    let complete = lines.joined(separator: "\n")
    guard !partial.isEmpty else { return complete }
    return complete.isEmpty ? partial : "\(complete)\n\(partial)"
  }

  private func boundedSuffix(_ text: String, maximumBytes: Int) -> String {
    guard text.utf8.count > maximumBytes else { return text }
    return String(decoding: text.utf8.suffix(maximumBytes), as: UTF8.self)
  }
}
