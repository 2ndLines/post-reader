// swift-tools-version: 6.0
// ReaderDomain：业务服务，只依赖下层协议（01 §3、§7）。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "ReaderDomain",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "ReaderDomain", targets: ["ReaderDomain"]),
    ],
    dependencies: [
        .package(path: "../Storage"),
        .package(path: "../Networking"),
        .package(path: "../Capture"),
        .package(path: "../Audio"),
        .package(path: "../Commerce"),
    ],
    targets: [
        .target(
            name: "ReaderDomain",
            dependencies: [
                .product(name: "Storage", package: "Storage"),
                .product(name: "Networking", package: "Networking"),
                .product(name: "Capture", package: "Capture"),
                .product(name: "Audio", package: "Audio"),
                .product(name: "Commerce", package: "Commerce"),
            ]
        ),
        .testTarget(name: "ReaderDomainTests", dependencies: ["ReaderDomain"]),
    ],
    swiftLanguageModes: [.v6]
)
