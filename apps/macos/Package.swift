// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "DeepSeekHarnessMacOS",
  platforms: [.macOS(.v14)],
  products: [
    .library(name: "DeepSeekHarnessCore", targets: ["DeepSeekHarnessCore"]),
    .executable(name: "DeepSeekHarnessApp", targets: ["DeepSeekHarnessApp"]),
  ],
  targets: [
    .target(name: "DeepSeekHarnessCore"),
    .executableTarget(
      name: "DeepSeekHarnessApp",
      dependencies: ["DeepSeekHarnessCore"]
    ),
    .testTarget(
      name: "DeepSeekHarnessCoreTests",
      dependencies: ["DeepSeekHarnessCore"],
      resources: [.copy("Fixtures")]
    ),
  ],
  swiftLanguageModes: [.v6]
)
