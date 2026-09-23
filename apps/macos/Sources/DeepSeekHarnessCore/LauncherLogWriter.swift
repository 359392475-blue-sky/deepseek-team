import Foundation

/// Owner-only rotating file log for launcher stdout and stderr.
public final class LauncherLogWriter: @unchecked Sendable {
  public let fileURL: URL
  private let maximumBytes: UInt64
  private let retainedFiles: Int
  private let fileManager: FileManager
  private let lock = NSLock()

  public init(
    fileURL: URL,
    maximumBytes: UInt64 = 5 * 1_024 * 1_024,
    retainedFiles: Int = 3,
    fileManager: FileManager = .default
  ) {
    precondition(maximumBytes > 0)
    precondition(retainedFiles > 0)
    self.fileURL = fileURL
    self.maximumBytes = maximumBytes
    self.retainedFiles = retainedFiles
    self.fileManager = fileManager
  }

  public static func standard() -> LauncherLogWriter {
    let root = FileManager.default.homeDirectoryForCurrentUser
      .appending(
        path: "Library/Logs/DeepSeek Harness Team Battle",
        directoryHint: .isDirectory
      )
    return LauncherLogWriter(fileURL: root.appending(path: "launcher.log"))
  }

  public func append(_ text: String) throws {
    lock.lock()
    defer { lock.unlock() }
    let directory = fileURL.deletingLastPathComponent()
    try fileManager.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700]
    )
    let bytes = Data(text.utf8)
    try rotateIfNeeded(incomingBytes: UInt64(bytes.count))
    if !fileManager.fileExists(atPath: fileURL.path) {
      guard fileManager.createFile(
        atPath: fileURL.path,
        contents: nil,
        attributes: [.posixPermissions: 0o600]
      ) else {
        throw CocoaError(.fileWriteUnknown)
      }
    }
    try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: fileURL.path)
    let handle = try FileHandle(forWritingTo: fileURL)
    defer { try? handle.close() }
    try handle.seekToEnd()
    try handle.write(contentsOf: bytes)
  }

  private func rotateIfNeeded(incomingBytes: UInt64) throws {
    let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path)
    let current = (attributes?[.size] as? NSNumber)?.uint64Value ?? 0
    guard current + incomingBytes > maximumBytes else { return }

    if retainedFiles == 1 {
      try? fileManager.removeItem(at: fileURL)
      return
    }
    let oldest = rotatedURL(retainedFiles - 1)
    try? fileManager.removeItem(at: oldest)
    if retainedFiles > 2 {
      for index in stride(from: retainedFiles - 2, through: 1, by: -1) {
        let source = rotatedURL(index)
        if fileManager.fileExists(atPath: source.path) {
          try fileManager.moveItem(at: source, to: rotatedURL(index + 1))
        }
      }
    }
    if fileManager.fileExists(atPath: fileURL.path) {
      try fileManager.moveItem(at: fileURL, to: rotatedURL(1))
    }
  }

  private func rotatedURL(_ index: Int) -> URL {
    URL(fileURLWithPath: "\(fileURL.path).\(index)")
  }
}
