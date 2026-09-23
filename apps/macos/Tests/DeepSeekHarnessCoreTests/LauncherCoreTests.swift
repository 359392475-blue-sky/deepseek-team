import Darwin
import Foundation
import Testing
import WebKit
@testable import DeepSeekHarnessCore

@Test func readinessParserAcceptsSplitChunks() {
  var parser = ReadinessParser()
  #expect(parser.consume("booting\ndsh web: http://127.") == nil)
  #expect(parser.consume("0.0.1:63803/?tok") == nil)
  #expect(parser.consume("en=team-secret\n")
    == URL(string: "http://127.0.0.1:63803/?token=team-secret"))
}

@Test func readinessParserRejectsNonLoopbackAndNonRootURLs() {
  var nonLoopback = ReadinessParser()
  #expect(nonLoopback.consume("dsh web: http://localhost:63803/?token=team-secret\n") == nil)
  var nonRoot = ReadinessParser()
  #expect(nonRoot.consume("dsh web: http://127.0.0.1:63803/team?token=team-secret\n") == nil)
  var unauthenticatedRoot = ReadinessParser()
  #expect(unauthenticatedRoot.consume("dsh web: http://127.0.0.1:63803/\n") == nil)
}

@Test func teamSpaceLaunchKeepsAuthenticationAndSelectsTheTeamFragment() {
  let ready = URL(string: "http://127.0.0.1:63803/?token=team-secret")!
  let selected = teamSpaceURL(from: ready)
  #expect(selected.absoluteString == "http://127.0.0.1:63803/?token=team-secret#team")
  #expect(teamSpaceURL(from: selected) == selected)
  #expect(URLComponents(url: selected, resolvingAgainstBaseURL: false)?.queryItems == [
    URLQueryItem(name: "token", value: "team-secret"),
  ])
}

@Test func lossyUTF8OutputStillPreservesASCIIReadiness() {
  var bytes = Data("dsh web: http://127.0.0.1:63804/?token=team-secret\n".utf8)
  bytes.append(contentsOf: [0xE4, 0xBD])
  var parser = ReadinessParser()

  #expect(parser.consume(String(decoding: bytes, as: UTF8.self))
    == URL(string: "http://127.0.0.1:63804/?token=team-secret"))
}

@Test func readinessOutputRedactorHoldsSplitTokensOutOfLogs() {
  var redactor = ReadinessOutputRedactor()
  let first = redactor.consume("booting\ndsh web: http://127.0.0.1:63803/?tok")
  let second = redactor.consume("en=team-secret")
  let third = redactor.consume("\nready\n")
  let output = first + second + third + redactor.finish()

  #expect(output.contains("booting"))
  #expect(output.contains("?token=<redacted>"))
  #expect(!output.contains("team-secret"))
}

@Test func webLoadsAreDeduplicatedByRequestedURL() {
  let requested = URL(string: "http://127.0.0.1:3080")!
  let committed = URL(string: "http://127.0.0.1:3080/")!
  var tracker = WebLoadRequestTracker()

  let firstLoad = tracker.shouldLoad(requested)
  #expect(firstLoad)
  #expect(committed != tracker.lastRequestedURL)
  let repeatedLoad = tracker.shouldLoad(requested)
  #expect(!repeatedLoad)
  let changedLoad = tracker.shouldLoad(URL(string: "http://127.0.0.1:3081")!)
  #expect(changedLoad)
}

@Test func embeddedBrowserRecoveryReloadsOncePerExactOrigin() {
  let firstOrigin = URL(string: "http://127.0.0.1:3080")!
  let secondOrigin = URL(string: "http://127.0.0.1:3081")!
  var policy = EmbeddedBrowserRecoveryPolicy()

  policy.prepare(for: firstOrigin)
  #expect(policy.actionAfterFailure() == .reloadFromOrigin)
  #expect(policy.actionAfterFailure() == .presentFailure)
  policy.prepare(for: URL(string: "http://127.0.0.1:3080/session/one")!)
  #expect(policy.actionAfterFailure() == .presentFailure)
  policy.prepare(for: secondOrigin)
  #expect(policy.actionAfterFailure() == .reloadFromOrigin)
}

@Test func webNavigationStaysOnTheHarnessOrigin() {
  let origin = URL(string: "http://127.0.0.1:3080")!
  #expect(isAllowedHarnessNavigation(
    URL(string: "http://127.0.0.1:3080/session/one")!,
    origin: origin
  ))
  #expect(!isAllowedHarnessNavigation(
    URL(string: "http://127.0.0.1:3081/")!,
    origin: origin
  ))
  #expect(!isAllowedHarnessNavigation(
    URL(string: "https://127.0.0.1:3080/")!,
    origin: origin
  ))
  #expect(!isAllowedHarnessNavigation(
    URL(string: "http://localhost:3080/")!,
    origin: origin
  ))
  #expect(isAllowedHarnessBlobURL(
    URL(string: "blob:http://127.0.0.1:3080/export")!,
    origin: origin
  ))
  #expect(!isAllowedHarnessBlobURL(
    URL(string: "blob:http://127.0.0.1:3081/export")!,
    origin: origin
  ))
}

@Test func processOutputIsDrainedBeforeTermination() async throws {
  let standardOutput = Pipe()
  let standardError = Pipe()
  let context = try ProcessRunContext(
    standardOutput: standardOutput,
    standardError: standardError
  )
  context.startReading()
  try standardOutput.fileHandleForWriting.write(contentsOf: Data("dsh web: http://127.".utf8))
  try standardOutput.fileHandleForWriting.write(contentsOf: Data("0.0.1:63803/?tok".utf8))
  try standardOutput.fileHandleForWriting.write(contentsOf: Data("en=team-secret\n".utf8))
  try standardError.fileHandleForWriting.write(contentsOf: Data("EADDRINUSE\n".utf8))
  try standardOutput.fileHandleForWriting.close()
  try standardError.fileHandleForWriting.close()
  context.processTerminated(status: 1)

  var readyURL: URL?
  var termination: (status: Int32, standardError: String)?
  var sawTermination = false
  for await event in context.events {
    switch event {
    case let .output(_, _, parsedURL, logWriteFailureCode):
      #expect(!sawTermination)
      #expect(logWriteFailureCode == nil)
      readyURL = parsedURL ?? readyURL
    case let .terminated(status, standardError, logWriteFailureCode):
      sawTermination = true
      #expect(logWriteFailureCode == nil)
      termination = (status, standardError)
    }
  }

  #expect(readyURL == URL(string: "http://127.0.0.1:63803/?token=team-secret"))
  #expect(termination?.status == 1)
  #expect(termination?.standardError.contains("EADDRINUSE") == true)
}

@Test func webContentRulesAllowOnlyTheExactHarnessOrigin() throws {
  let origin = URL(string: "http://127.0.0.1:3080")!
  let json = try harnessContentRuleListJSON(origin: origin)

  #expect(json.contains("127[.]0[.]0[.]1:3080"))
  #expect(!json.contains("127[.]0[.]0[.]1:3081"))
  #expect(json.contains("ignore-previous-rules"))
  #expect(json.contains("about:blank"))
  #expect(throws: (any Error).self) {
    try harnessContentRuleListJSON(origin: URL(string: "https://127.0.0.1:3080")!)
  }
}

@MainActor
@Test func webContentRulesCompileInWebKit() async throws {
  let origin = URL(string: "http://127.0.0.1:3080")!
  let json = try harnessContentRuleListJSON(origin: origin)
  let rules = try await WKContentRuleListStore.default().compileContentRuleList(
    forIdentifier: "com.bluesky.deepseek-harness-team-battle.tests.\(UUID().uuidString)",
    encodedContentRuleList: json
  )

  #expect(rules != nil)
}

@Test func diskOutputSinkIsCompleteWhenTheUIEventBufferDropsOutput() async throws {
  let standardOutput = Pipe()
  let standardError = Pipe()
  let counter = LockedByteCounter()
  let context = try ProcessRunContext(
    standardOutput: standardOutput,
    standardError: standardError,
    outputSink: { text in
      counter.addAndReportFirst(text.utf8.count) ? Int(EIO) : nil
    }
  )
  context.startReading()
  let payload = Data(repeating: 0x78, count: 12 * 1_024 * 1_024)
  let writer = Task.detached {
    try standardOutput.fileHandleForWriting.write(contentsOf: payload)
    try standardOutput.fileHandleForWriting.close()
    try standardError.fileHandleForWriting.close()
  }
  try await writer.value
  context.processTerminated(status: 0)

  var streamedBytes = 0
  var logWriteFailureCode: Int?
  for await event in context.events {
    if case let .output(text, _, _, code) = event {
      streamedBytes += text.utf8.count
      logWriteFailureCode = code ?? logWriteFailureCode
    }
    if case let .terminated(_, _, code) = event {
      logWriteFailureCode = code ?? logWriteFailureCode
    }
  }

  #expect(counter.value == payload.count)
  #expect(streamedBytes < payload.count)
  #expect(logWriteFailureCode == Int(EIO))
}

@Test func dynamicPortFallbackIsNarrowAndOneShot() {
  #expect(shouldRetryWithDynamicPort(
    attemptedPort: 3_080,
    alreadyRetried: false,
    standardError: "listen EADDRINUSE: address already in use"
  ))
  #expect(!shouldRetryWithDynamicPort(
    attemptedPort: 0,
    alreadyRetried: false,
    standardError: "EADDRINUSE"
  ))
  #expect(!shouldRetryWithDynamicPort(
    attemptedPort: 3_080,
    alreadyRetried: true,
    standardError: "EADDRINUSE"
  ))
  #expect(!shouldRetryWithDynamicPort(
    attemptedPort: 3_080,
    alreadyRetried: false,
    standardError: "configuration failed"
  ))
}

@Test func environmentRemovesNodeInjectionAndPrioritizesBundle() {
  let environment = launcherEnvironment(
    base: [
      "HOME": "/Users/test",
      "PATH": "/custom/bin:/usr/bin",
      "NODE_OPTIONS": "--require hostile.js",
      "NODE_PATH": "/tmp/modules",
      "HTTPS_PROXY": "http://127.0.0.1:7890",
    ],
    bundledNodeDirectory: "/App/runtime/bin",
    dshHome: "/Users/test/Library/Application Support/DeepSeek Harness Team Battle"
  )
  #expect(environment["NODE_OPTIONS"] == nil)
  #expect(environment["NODE_PATH"] == nil)
  #expect(environment["HOME"] == "/Users/test")
  #expect(environment["HTTPS_PROXY"] == "http://127.0.0.1:7890")
  #expect(environment["DSH_HOME"]
    == "/Users/test/Library/Application Support/DeepSeek Harness Team Battle")
  #expect(environment["PATH"]?.hasPrefix("/App/runtime/bin:") == true)
  #expect(environment["PATH"]?.components(separatedBy: ":").count(where: { $0 == "/usr/bin" }) == 1)
}

@Test func logBufferKeepsWholeLinesAndBoundsHistory() {
  var buffer = LauncherLogBuffer(capacity: 2)
  buffer.append("one\nt")
  buffer.append("wo\nthree\n")
  #expect(buffer.lines == ["two", "three"])
  #expect(buffer.displayText == "two\nthree")
}

@Test func logBufferBoundsOutputWithoutNewlines() {
  var buffer = LauncherLogBuffer(capacity: 500, maximumBytes: 64)
  buffer.append(String(repeating: "x", count: 10_000))

  #expect(buffer.displayText.utf8.count <= 64)
  #expect(buffer.lines.isEmpty)
}

@Test func completedDownloadAtomicallyReplacesTheSelectedFile() throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "dsh-download-destination-\(UUID().uuidString)", directoryHint: .isDirectory)
  defer { try? FileManager.default.removeItem(at: root) }
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  let final = root.appending(path: "download.txt")
  try Data("old".utf8).write(to: final)

  let destination = try makeNativeDownloadDestination(finalURL: final)
  #expect(destination.stagingURL.deletingLastPathComponent() == root)
  #expect(!FileManager.default.fileExists(atPath: destination.stagingURL.path))
  try Data("new".utf8).write(to: destination.stagingURL)
  try commitNativeDownload(destination)

  #expect(try String(contentsOf: final, encoding: .utf8) == "new")
  #expect(!FileManager.default.fileExists(atPath: destination.stagingURL.path))
}

@Test func failedDownloadKeepsTheSelectedFileAndDiscardsOnlyStaging() throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "dsh-download-failure-\(UUID().uuidString)", directoryHint: .isDirectory)
  defer { try? FileManager.default.removeItem(at: root) }
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  let final = root.appending(path: "download.txt")
  try Data("old".utf8).write(to: final)
  let destination = try makeNativeDownloadDestination(finalURL: final)
  try Data("partial".utf8).write(to: destination.stagingURL)

  try discardNativeDownload(destination)

  #expect(try String(contentsOf: final, encoding: .utf8) == "old")
  #expect(!FileManager.default.fileExists(atPath: destination.stagingURL.path))
}

@Test func downloadStagingNameDoesNotGrowWithALongSelectedFilename() throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "dsh-download-long-name-\(UUID().uuidString)", directoryHint: .isDirectory)
  defer { try? FileManager.default.removeItem(at: root) }
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  let filename = String(repeating: "界", count: 80) + ".txt"
  let final = root.appending(path: filename)
  try Data("old".utf8).write(to: final)

  let destination = try makeNativeDownloadDestination(finalURL: final)

  #expect(destination.stagingURL.lastPathComponent.utf8.count <= 255)
  #expect(destination.stagingURL.lastPathComponent.utf8.count < filename.utf8.count)
}

@Test func downloadReplacementDoesNotFollowASelectedSymbolicLink() throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "dsh-download-link-\(UUID().uuidString)", directoryHint: .isDirectory)
  defer { try? FileManager.default.removeItem(at: root) }
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  let target = root.appending(path: "target.txt")
  let link = root.appending(path: "download.txt")
  try Data("keep".utf8).write(to: target)
  try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
  let destination = try makeNativeDownloadDestination(finalURL: link)
  try Data("replacement".utf8).write(to: destination.stagingURL)

  try commitNativeDownload(destination)

  #expect(try String(contentsOf: target, encoding: .utf8) == "keep")
  #expect(try String(contentsOf: link, encoding: .utf8) == "replacement")
}

@MainActor
@Test func keylessLifecycleSnapshotMatches() async throws {
  let cancelPhases: [LauncherPhase] = [
    .idle,
    .choosing,
    phaseAfterWorkspaceSelectionCancelled(previous: .idle, processIsRunning: false),
  ]

  let readyFixture = try LauncherFixture(script: """
    #!/bin/sh
    printf 'dsh web: http://127.0.0.1:3080/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { readyFixture.remove() }
  var readyPhases: [LauncherPhase] = [.idle, .choosing]
  let readyLauncher = readyFixture.makeLauncher(
    phaseObserver: { readyPhases.append($0) }
  )
  readyLauncher.start(workspace: readyFixture.workspace)
  #expect(await waitUntil { readyLauncher.readyURL?.port == 3_080 })
  readyPhases.append(readyLauncher.phase)
  await readyLauncher.stopForApplicationTermination()

  let retryFixture = try LauncherFixture(script: """
    #!/bin/sh
    marker="$PWD/.snapshot-attempted"
    if [ ! -f "$marker" ]; then
      : > "$marker"
      printf 'failed\n' >&2
      exit 7
    fi
    printf 'dsh web: http://127.0.0.1:3080/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { retryFixture.remove() }
  var retryPhases: [LauncherPhase] = []
  let retryLauncher = retryFixture.makeLauncher(
    phaseObserver: { retryPhases.append($0) }
  )
  retryLauncher.start(workspace: retryFixture.workspace)
  #expect(await waitUntil {
    if case .failed = retryLauncher.phase { return true }
    return false
  })
  retryLauncher.start()
  #expect(await waitUntil { retryLauncher.readyURL?.port == 3_080 })
  let capturedRetryPhases = retryPhases
  await retryLauncher.stopForApplicationTermination()

  let scenarios: [(String, [LauncherPhase])] = [
    ("cancel", cancelPhases),
    ("ready-close-reopen-quit", readyPhases),
    ("failure-retry", capturedRetryPhases),
  ]
  let actual = scenarios.map { name, phases in
    "\(name):\n" + phases.map { "  \($0.snapshotName)" }.joined(separator: "\n")
  }.joined(separator: "\n") + "\n"
  let fixture = try #require(Bundle.module.url(
    forResource: "launcher-lifecycle",
    withExtension: "snapshot.txt",
    subdirectory: "Fixtures"
  ))
  let expected = try String(contentsOf: fixture, encoding: .utf8)

  #expect(actual == expected)
}

@MainActor
@Test func fileLogRotatesAndKeepsOwnerOnlyMode() throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "dsh-launcher-log-\(UUID().uuidString)", directoryHint: .isDirectory)
  defer { try? FileManager.default.removeItem(at: root) }
  let file = root.appending(path: "launcher.log")
  let writer = LauncherLogWriter(fileURL: file, maximumBytes: 8, retainedFiles: 3)
  try writer.append("12345678")
  try writer.append("abcdef")
  try writer.append("ghijkl")

  #expect(FileManager.default.fileExists(atPath: file.path))
  #expect(FileManager.default.fileExists(atPath: "\(file.path).1"))
  #expect(FileManager.default.fileExists(atPath: "\(file.path).2"))
  let attributes = try FileManager.default.attributesOfItem(atPath: file.path)
  let mode = (attributes[.posixPermissions] as? NSNumber)?.intValue
  #expect(mode == 0o600)
}

@Test func cancelledWorkspaceSelectionRestoresOnlyALiveRun() {
  let workspace = URL(fileURLWithPath: "/tmp/project with spaces")
  let ready = LauncherPhase.ready(
    workspace: workspace,
    url: URL(string: "http://127.0.0.1:3080")!
  )
  #expect(phaseAfterWorkspaceSelectionCancelled(
    previous: ready,
    processIsRunning: true
  ) == ready)
  #expect(phaseAfterWorkspaceSelectionCancelled(
    previous: .failed(workspace: workspace, message: "failed"),
    processIsRunning: false
  ) == .idle)
  #expect(phaseWhileWorkspacePickerIsOpen(
    previous: ready,
    processIsRunning: true
  ) == ready)
  #expect(phaseWhileWorkspacePickerIsOpen(
    previous: .idle,
    processIsRunning: false
  ) == .choosing)
}

@MainActor
@Test func launcherRunsAndStopsInAWorkspaceWithSpaces() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    printf 'cwd=%s\n' "$PWD"
    printf 'dsh web: http://127.0.0.1:45678/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()

  launcher.start(workspace: fixture.workspace)
  let becameReady = await waitUntil { launcher.readyURL?.port == 45_678 }
  #expect(becameReady)
  #expect(launcher.currentWorkspace == fixture.workspace)
  #expect(launcher.recentLog.split(separator: "\n").contains {
    $0.hasPrefix("cwd=") && $0.hasSuffix("/project with spaces")
  })

  launcher.stop()
  #expect(await waitUntil { launcher.phase == .idle })
}

@MainActor
@Test func launcherLoadsAuthenticatedURLWithoutLoggingItsSplitToken() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    printf 'dsh web: http://127.0.0.1:45677/?tok'
    /bin/sleep 0.05
    printf 'en=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()

  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil {
    launcher.readyURL == URL(string: "http://127.0.0.1:45677/?token=team-secret#team")
  })
  #expect(launcher.recentLog.contains("?token=<redacted>"))
  #expect(!launcher.recentLog.contains("team-secret"))
  #expect(try fixture.logContents().contains("?token=<redacted>"))
  #expect(try !fixture.logContents().contains("team-secret"))

  launcher.stop()
  #expect(await waitUntil { launcher.phase == .idle })
}

@MainActor
@Test func launcherRetriesPortConflictOnceWithDynamicPort() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    if [ "$8" = "3080" ]; then
      printf 'listen EADDRINUSE: address already in use\n' >&2
      exit 1
    fi
    printf 'dsh web: http://127.0.0.1:45679/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()

  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil { launcher.readyURL?.port == 45_679 })
  #expect(launcher.recentLog.contains("retrying with a dynamic port"))

  launcher.stop()
  #expect(await waitUntil { launcher.phase == .idle })
}

@MainActor
@Test func launcherPersistsTheLastReadyPort() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    printf 'requested-port=%s\n' "$8"
    printf 'dsh web: http://127.0.0.1:45682/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { fixture.remove() }
  let first = fixture.makeLauncher()
  first.start(workspace: fixture.workspace)
  #expect(await waitUntil { first.readyURL?.port == 45_682 })
  first.stop()
  #expect(await waitUntil { first.phase == .idle })

  let second = fixture.makeLauncher()
  second.start(workspace: fixture.workspace)
  #expect(await waitUntil { second.readyURL?.port == 45_682 })
  #expect(second.recentLog.contains("requested-port=45682"))
  second.stop()
  #expect(await waitUntil { second.phase == .idle })
}

@MainActor
@Test func launcherCanRetryAfterAnAbnormalExit() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    marker="$PWD/.launcher-attempted"
    if [ ! -f "$marker" ]; then
      : > "$marker"
      printf 'first launch failed\n' >&2
      exit 7
    fi
    printf 'dsh web: http://127.0.0.1:45680/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()

  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil {
    if case .failed = launcher.phase { return true }
    return false
  })
  launcher.start()
  #expect(await waitUntil { launcher.readyURL?.port == 45_680 })

  launcher.stop()
  #expect(await waitUntil { launcher.phase == .idle })
}

@MainActor
@Test func interfaceReloadKeepsTheHarnessProcessAndClearsAWebFailure() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    count_file="$PWD/launch-count"
    count=0
    if [ -f "$count_file" ]; then count="$(cat "$count_file")"; fi
    count=$((count + 1))
    printf '%s' "$count" > "$count_file"
    printf 'dsh web: http://127.0.0.1:45685/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()

  launcher.reloadInterface()
  #expect(launcher.interfaceReloadRequestID == 0)
  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil { launcher.readyURL?.port == 45_685 })
  let countURL = fixture.workspace.appending(path: "launch-count")
  #expect(try String(contentsOf: countURL, encoding: .utf8) == "1")

  launcher.recordEmbeddedBrowserAutomaticReload(
    kind: .navigationFailed,
    errorCode: NSURLErrorCannotConnectToHost
  )
  launcher.reportEmbeddedBrowserFailure(
    kind: .contentProcessTerminated,
    errorCode: nil
  )
  #expect(launcher.embeddedBrowserFailure == EmbeddedBrowserFailure(
    kind: .contentProcessTerminated,
    errorCode: nil
  ))
  let browserLogLines = launcher.recentLog.split(separator: "\n").filter {
    $0.contains("embedded browser")
  }
  #expect(browserLogLines == [
    "launcher: embedded browser navigation-failed; reloading interface automatically, error \(NSURLErrorCannotConnectToHost)",
    "launcher: embedded browser recovery failed (content-process-terminated)",
  ])

  launcher.reloadInterface()
  #expect(launcher.interfaceReloadRequestID == 1)
  #expect(launcher.embeddedBrowserFailure == nil)
  #expect(launcher.readyURL?.port == 45_685)
  #expect(launcher.isProcessRunning)
  try? await Task.sleep(for: .milliseconds(100))
  #expect(try String(contentsOf: countURL, encoding: .utf8) == "1")

  launcher.stop()
  #expect(await waitUntil { launcher.phase == .idle })
}

@MainActor
@Test func readyServiceRestartsOnceWithCurrentAuthenticationAndThenRequiresRetry() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    count_file="$PWD/launch-count"
    count=0
    if [ -f "$count_file" ]; then count="$(cat "$count_file")"; fi
    count=$((count + 1))
    printf '%s' "$count" > "$count_file"
    printf 'dsh web: http://127.0.0.1:45686/?token=team-secret-%s\n' "$count"
    trap 'exit 0' TERM
    while [ ! -f "$PWD/exit-$count" ]; do /bin/sleep 0.01; done
    exit 17
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()
  let countURL = fixture.workspace.appending(path: "launch-count")
  launcher.start(workspace: fixture.workspace)

  do {
    try #require(await waitUntil {
      launcher.readyURL?.absoluteString == "http://127.0.0.1:45686/?token=team-secret-1#team"
    })
    try Data().write(to: fixture.workspace.appending(path: "exit-1"))
    try #require(await waitUntil {
      launcher.readyURL?.absoluteString == "http://127.0.0.1:45686/?token=team-secret-2#team"
    })
    #expect(try String(contentsOf: countURL, encoding: .utf8) == "2")
    #expect(launcher.recentLog.contains("service exited after readiness; restarting once"))
    #expect(!launcher.recentLog.contains("team-secret"))

    try Data().write(to: fixture.workspace.appending(path: "exit-2"))
    try #require(await waitUntil {
      if case .failed = launcher.phase { return true }
      return false
    })
    #expect(launcher.readyURL == nil)
    #expect(!launcher.hasManagedProcess)
    #expect(try String(contentsOf: countURL, encoding: .utf8) == "2")
    if case let .failed(_, message) = launcher.phase {
      #expect(message.contains("自动恢复已停止"))
    }

    launcher.restart()
    try #require(await waitUntil {
      launcher.readyURL?.absoluteString == "http://127.0.0.1:45686/?token=team-secret-3#team"
    })
    launcher.stop()
    try #require(await waitUntil { launcher.phase == .idle })
    #expect(try String(contentsOf: countURL, encoding: .utf8) == "3")
  } catch {
    await launcher.stopForApplicationTermination()
    throw error
  }
}

@MainActor
@Test func explicitStopCancelsAQueuedRestart() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    printf 'dsh web: http://127.0.0.1:45684/?token=team-secret\n'
    trap 'exit 0' TERM
    while :; do /bin/sleep 1; done
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()
  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil { launcher.readyURL?.port == 45_684 })

  launcher.restart()
  launcher.stop()

  #expect(await waitUntil { launcher.phase == .idle })
  try? await Task.sleep(for: .milliseconds(100))
  #expect(launcher.phase == .idle)
  #expect(!launcher.hasManagedProcess)
}

@MainActor
@Test func cleanExitBeforeReadinessIsReportedAsAStartFailure() async throws {
  let fixture = try LauncherFixture(script: "#!/bin/sh\nexit 0\n")
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()

  launcher.start(workspace: fixture.workspace)

  #expect(await waitUntil {
    if case .failed = launcher.phase { return true }
    return false
  })
  #expect(launcher.recentLog.contains("starting workspace"))
}

@MainActor
@Test func processGroupVerificationFailureStillForceStopsTheChild() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    trap '' TERM
    printf '%s\n' "$$" > "$PWD/verification-failure.pid"
    while :; do /bin/sleep 30; done
    """)
  defer {
    terminateFixtureProcess(at: fixture.workspace.appending(path: "verification-failure.pid"))
    fixture.remove()
  }
  let identifierURL = fixture.workspace.appending(path: "verification-failure.pid")
  let launcher = fixture.makeLauncher(
    gracefulStopTimeout: .milliseconds(100),
    stopPollInterval: .milliseconds(10),
    processGroupVerifier: { _ in
      for _ in 0..<200 where !FileManager.default.fileExists(atPath: identifierURL.path) {
        usleep(1_000)
      }
      throw ForcedProcessGroupVerificationError()
    }
  )

  launcher.start(workspace: fixture.workspace)

  #expect(await waitUntil {
    if case .failed = launcher.phase { return true }
    return false
  })
  let childPID = try? fixtureProcessID(at: identifierURL)
  #expect(childPID != nil)
  if let childPID {
    #expect(await waitUntil { !processExists(childPID) })
  }
  #expect(launcher.recentLog.contains("force stopping managed processes"))
}

@MainActor
@Test func inheritedOutputPipeDoesNotDelayAbnormalExitHandling() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    /usr/bin/python3 -c 'import os, signal, sys, time; os.setsid(); signal.signal(signal.SIGHUP, signal.SIG_IGN); signal.signal(signal.SIGTERM, signal.SIG_IGN); open(sys.argv[1], "w").write(str(os.getpid())); time.sleep(30)' "$PWD/inherited-pipe-child.pid" &
    while [ ! -f "$PWD/inherited-pipe-child.pid" ]; do /bin/sleep 0.01; done
    /bin/sleep 0.2
    printf 'parent failed\n' >&2
    exit 9
    """)
  defer {
    terminateFixtureProcess(at: fixture.workspace.appending(path: "inherited-pipe-child.pid"))
    fixture.remove()
  }
  let launcher = fixture.makeLauncher(
    gracefulStopTimeout: .milliseconds(100),
    stopPollInterval: .milliseconds(10)
  )

  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil(timeout: .seconds(1)) {
    if case .failed = launcher.phase { return true }
    return false
  })
  let childPID = try? fixtureProcessID(
    at: fixture.workspace.appending(path: "inherited-pipe-child.pid")
  )
  #expect(childPID != nil)
  guard let childPID else { return }
  #expect(await waitUntil { !processExists(childPID) })
  #expect(launcher.recentLog.contains("force stopping managed processes"))
}

@MainActor
@Test func continuousInheritedOutputCannotStarveTermination() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    printf '%s\n' "$$" > "$PWD/continuous-output-group.pid"
    for _ in 1 2 3 4 5 6 7 8; do /usr/bin/yes x & done
    /bin/sleep 0.05
    exit 9
    """)
  defer {
    terminateFixtureProcessGroup(
      at: fixture.workspace.appending(path: "continuous-output-group.pid")
    )
    fixture.remove()
  }
  let launcher = fixture.makeLauncher(
    gracefulStopTimeout: .milliseconds(100),
    stopPollInterval: .milliseconds(10)
  )

  launcher.start(workspace: fixture.workspace)

  #expect(await waitUntil(timeout: .seconds(2)) {
    if case .failed = launcher.phase { return true }
    return false
  })
  #expect(launcher.recentLog.utf8.count <= 256 * 1_024)
}

@MainActor
@Test func parentExitDoesNotPublishIdleBeforeItsProcessGroupIsQuiet() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    printf 'dsh web: http://127.0.0.1:45683/?token=team-secret\n'
    /usr/bin/python3 -c 'import os, signal, sys, time; os.setsid(); signal.signal(signal.SIGHUP, signal.SIG_IGN); signal.signal(signal.SIGTERM, signal.SIG_IGN); open(sys.argv[1], "w").write(str(os.getpid())); time.sleep(30)' "$PWD/stop-child.pid" &
    while [ ! -f "$PWD/stop-child.pid" ]; do /bin/sleep 0.01; done
    trap 'exit 0' TERM
    while :; do /bin/sleep 30; done
    """)
  defer {
    terminateFixtureProcess(at: fixture.workspace.appending(path: "stop-child.pid"))
    fixture.remove()
  }
  let launcher = fixture.makeLauncher(
    gracefulStopTimeout: .milliseconds(200),
    stopPollInterval: .milliseconds(10)
  )
  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil { launcher.readyURL?.port == 45_683 })
  let childPIDURL = fixture.workspace.appending(path: "stop-child.pid")
  #expect(await waitUntil {
    FileManager.default.fileExists(atPath: childPIDURL.path)
  })
  let childPID = try? fixtureProcessID(at: childPIDURL)
  #expect(childPID != nil)
  guard let childPID else {
    await launcher.stopForApplicationTermination()
    return
  }

  launcher.stop()
  #expect(await waitUntil { launcher.phase == .stopping })
  try? await Task.sleep(for: .milliseconds(50))
  #expect(launcher.phase == .stopping)
  #expect(launcher.hasManagedProcess)
  #expect(processExists(childPID))
  #expect(await waitUntil { launcher.phase == .idle })
  #expect(await waitUntil { !processExists(childPID) })
}

@MainActor
@Test func launcherEscalatesAnIgnoredTerminationAndReachesIdle() async throws {
  let fixture = try LauncherFixture(script: """
    #!/bin/sh
    printf 'dsh web: http://127.0.0.1:45681/?token=team-secret\n'
    trap '' TERM
    while :; do /bin/sleep 10; done
    """)
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher(
    gracefulStopTimeout: .milliseconds(100),
    stopPollInterval: .milliseconds(10)
  )

  launcher.start(workspace: fixture.workspace)
  #expect(await waitUntil { launcher.readyURL?.port == 45_681 })
  launcher.stop()
  #expect(await waitUntil { launcher.phase == .idle })
  #expect(launcher.recentLog.contains("graceful stop timed out; force stopping"))
}

@MainActor
@Test func terminationBeforeLaunchIsAlreadyQuiescent() async throws {
  let fixture = try LauncherFixture(script: "#!/bin/sh\nexit 0\n")
  defer { fixture.remove() }
  let launcher = fixture.makeLauncher()

  await launcher.stopForApplicationTermination()
  #expect(launcher.phase == .idle)
  #expect(!launcher.isProcessRunning)
}

@MainActor
private final class LauncherFixture {
  let root: URL
  let workspace: URL

  private let resources: LauncherRuntimeResources
  private let defaults: UserDefaults
  private let defaultsSuite: String
  private let logURL: URL

  init(script: String) throws {
    root = FileManager.default.temporaryDirectory
      .appending(path: "dsh-launcher-fixture-\(UUID().uuidString)", directoryHint: .isDirectory)
    workspace = root.appending(path: "project with spaces", directoryHint: .isDirectory)
    let runtime = root.appending(path: "runtime", directoryHint: .isDirectory)
    let node = runtime.appending(path: "bin/node")
    let entry = runtime.appending(path: "lib/bin.js")
    try FileManager.default.createDirectory(
      at: workspace,
      withIntermediateDirectories: true
    )
    try FileManager.default.createDirectory(
      at: node.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try FileManager.default.createDirectory(
      at: entry.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try script.write(to: node, atomically: true, encoding: .utf8)
    try Data().write(to: entry)
    try FileManager.default.setAttributes(
      [.posixPermissions: 0o700],
      ofItemAtPath: node.path
    )
    resources = LauncherRuntimeResources(node: node, entry: entry)
    defaultsSuite = "DeepSeekHarnessTests.\(UUID().uuidString)"
    defaults = UserDefaults(suiteName: defaultsSuite)!
    defaults.removePersistentDomain(forName: defaultsSuite)
    logURL = root.appending(path: "logs/launcher.log")
  }

  func makeLauncher(
    gracefulStopTimeout: Duration = .seconds(6),
    stopPollInterval: Duration = .milliseconds(20),
    processGroupVerifier: (@MainActor (Process) throws -> Int32)? = nil,
    phaseObserver: (@MainActor (LauncherPhase) -> Void)? = nil
  ) -> HarnessLauncher {
    HarnessLauncher(
      defaults: defaults,
      logWriter: LauncherLogWriter(fileURL: logURL),
      runtimeResolver: { self.resources },
      processGroupVerifier: processGroupVerifier,
      gracefulStopTimeout: gracefulStopTimeout,
      stopPollInterval: stopPollInterval,
      phaseObserver: phaseObserver
    )
  }

  func remove() {
    defaults.removePersistentDomain(forName: defaultsSuite)
    try? FileManager.default.removeItem(at: root)
  }

  func logContents() throws -> String {
    try String(contentsOf: logURL, encoding: .utf8)
  }
}

@MainActor
private func waitUntil(
  timeout: Duration = .seconds(4),
  condition: @MainActor () -> Bool
) async -> Bool {
  let clock = ContinuousClock()
  let deadline = clock.now.advanced(by: timeout)
  while clock.now < deadline {
    if condition() { return true }
    try? await Task.sleep(for: .milliseconds(20))
  }
  return condition()
}

private func fixtureProcessID(at url: URL) throws -> Int32 {
  let text = try String(contentsOf: url, encoding: .utf8)
  return try #require(Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)))
}

private func processExists(_ identifier: Int32) -> Bool {
  guard identifier > 1 else { return false }
  if Darwin.kill(identifier, 0) == 0 { return true }
  return errno == EPERM
}

private func terminateFixtureProcess(at url: URL) {
  guard let text = try? String(contentsOf: url, encoding: .utf8),
        let identifier = Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)),
        identifier > 1 else {
    return
  }
  _ = Darwin.kill(identifier, SIGKILL)
}

private func terminateFixtureProcessGroup(at url: URL) {
  guard let text = try? String(contentsOf: url, encoding: .utf8),
        let identifier = Int32(text.trimmingCharacters(in: .whitespacesAndNewlines)),
        identifier > 1 else {
    return
  }
  _ = Darwin.kill(-identifier, SIGKILL)
}

private struct ForcedProcessGroupVerificationError: LocalizedError {
  var errorDescription: String? { "forced process-group verification failure" }
}

private final class LockedByteCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var count = 0
  private var calls = 0

  var value: Int {
    lock.lock()
    defer { lock.unlock() }
    return count
  }

  func addAndReportFirst(_ value: Int) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    count += value
    calls += 1
    return calls == 1
  }
}
