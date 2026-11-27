// swift-tools-version: 6.0
// Networking：HTTP 中间件、签名、Attest、WebSocket、区域端点（01 §3、§8）。受保护路径。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "Networking",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "Networking", targets: ["Networking"]),
    ],
    dependencies: [
        .package(path: "../APIClient"),
        .package(path: "../ReaderCore"),
    ],
    targets: [
        .target(
            name: "Networking",
            dependencies: [
                .product(name: "APIClient", package: "APIClient"),
                .product(name: "ReaderCore", package: "ReaderCore"),
            ]
        ),
        .testTarget(name: "NetworkingTests", dependencies: ["Networking"]),
    ],
    swiftLanguageModes: [.v6]
)
