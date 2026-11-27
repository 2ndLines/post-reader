// swift-tools-version: 6.0
// Capture：直抓、网页引擎抓取、规则运行时（01 §3、§10）。CaptureDirect 是 Share Extension 可用的直抓子集。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "Capture",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "Capture", targets: ["Capture"]),
        .library(name: "CaptureDirect", targets: ["CaptureDirect"]),
    ],
    dependencies: [
        .package(path: "../ReaderCore"),
    ],
    targets: [
        .target(name: "Capture", dependencies: [.product(name: "ReaderCore", package: "ReaderCore")]),
        .testTarget(name: "CaptureTests", dependencies: ["Capture"]),
        .target(name: "CaptureDirect", dependencies: [.product(name: "ReaderCore", package: "ReaderCore")]),
        .testTarget(name: "CaptureDirectTests", dependencies: ["CaptureDirect"]),
    ],
    swiftLanguageModes: [.v6]
)
