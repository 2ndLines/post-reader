// swift-tools-version: 6.0
// ReaderCore：纯逻辑包（01 §3），只依赖 Foundation 与 CryptoKit。
// macOS 平台仅用于在宿主机上直接运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "ReaderCore",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "ReaderCore", targets: ["ReaderCore"]),
    ],
    targets: [
        .target(name: "ReaderCore"),
        .testTarget(name: "ReaderCoreTests", dependencies: ["ReaderCore"]),
    ],
    swiftLanguageModes: [.v6]
)
