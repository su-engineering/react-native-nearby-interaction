// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "NearbyInteractionProtocol",
  platforms: [.macOS(.v12), .iOS(.v15)],
  products: [.library(name: "NearbyInteractionProtocol", targets: ["NearbyInteractionProtocol"])],
  targets: [
    .target(name: "NearbyInteractionProtocol", path: "ios",
            exclude: ["BLEChannel.swift", "NIController.swift", "RNNearbyInteraction.h", "RNNearbyInteraction.mm"],
            sources: ["AccessoryOptions.swift", "TTagProtocol.swift"]),
    .testTarget(name: "NearbyInteractionProtocolTests", dependencies: ["NearbyInteractionProtocol"], path: "tests/swift")
  ]
)
