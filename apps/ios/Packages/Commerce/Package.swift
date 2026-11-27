// swift-tools-version: 6.0
// Commerce：登录、订阅（01 §3）。受保护路径。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "Commerce",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "Commerce", targets: ["Commerce"]),
    ],
    dependencies: [
        .package(path: "../Networking"),
    ],
    targets: [
        .target(name: "Commerce", dependencies: [.product(name: "Networking", package: "Networking")]),
        .testTarget(name: "CommerceTests", dependencies: ["Commerce"]),
    ],
    swiftLanguageModes: [.v6]
)
