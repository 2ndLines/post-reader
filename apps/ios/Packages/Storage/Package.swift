// swift-tools-version: 6.0
// Storage：加密数据库、音频缓存、Keychain、共享收件箱、磁盘预算（01 §3、§9）。StorageInbox 是 Share Extension 可用的最小子集。受保护路径。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "Storage",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "Storage", targets: ["Storage"]),
        .library(name: "StorageInbox", targets: ["StorageInbox"]),
    ],
    dependencies: [
        .package(path: "../ReaderCore"),
        // GRDB + SQLCipher：源码由 Vendor/fetch-grdb.sh 取得并校验（ADR 0019）
        .package(path: "../../Vendor/GRDB"),
    ],
    targets: [
        .target(
            name: "Storage",
            dependencies: [
                .product(name: "ReaderCore", package: "ReaderCore"),
                .product(name: "GRDB", package: "GRDB"),
            ]
        ),
        .testTarget(name: "StorageTests", dependencies: ["Storage"]),
        .target(name: "StorageInbox"),
        .testTarget(name: "StorageInboxTests", dependencies: ["StorageInbox"]),
    ],
    swiftLanguageModes: [.v6]
)
