// swift-tools-version: 6.0
// DesignSystem：token 与组件（01 §5）；不依赖业务模块。视觉取值来自冻结原型（prototype-frozen-2026-11-23 的 DESIGN.md 与 globals.css）。
// 快照测试只在 iOS 模拟器上运行（swift-snapshot-testing，05 §4.4 已定；只用于测试目标，不进发布包）。
import PackageDescription

let package = Package(
    name: "DesignSystem",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"]),
    ],
    dependencies: [
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", exact: "1.19.7"),
    ],
    targets: [
        .target(name: "DesignSystem"),
        .testTarget(
            name: "DesignSystemTests",
            dependencies: [
                "DesignSystem",
                .product(name: "SnapshotTesting", package: "swift-snapshot-testing"),
            ],
            exclude: ["__Snapshots__"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
