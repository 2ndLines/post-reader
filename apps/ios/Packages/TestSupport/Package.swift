// swift-tools-version: 6.0
// TestSupport：假实现、fixture、快照工具（01 §2）。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "TestSupport",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "TestSupport", targets: ["TestSupport"]),
    ],
    dependencies: [
        .package(path: "../ReaderCore"),
    ],
    targets: [
        .target(name: "TestSupport", dependencies: [.product(name: "ReaderCore", package: "ReaderCore")]),
        .testTarget(name: "TestSupportTests", dependencies: ["TestSupport"]),
    ],
    swiftLanguageModes: [.v6]
)
