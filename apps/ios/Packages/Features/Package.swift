// swift-tools-version: 6.0
// Features：页面与页面 Model（01 §3、§6）；只依赖 ReaderDomain 与 DesignSystem，不声明 Infra 包，编译期阻止越层调用。其余 Feature 随各自任务卡加入。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "Features",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "FeatureOnboarding", targets: ["FeatureOnboarding"]),
        .library(name: "FeatureHome", targets: ["FeatureHome"]),
        .library(name: "FeaturePlayer", targets: ["FeaturePlayer"]),
    ],
    dependencies: [
        .package(path: "../ReaderDomain"),
        .package(path: "../DesignSystem"),
    ],
    targets: [
        .target(
            name: "FeatureOnboarding",
            dependencies: [
                .product(name: "ReaderDomain", package: "ReaderDomain"),
                .product(name: "DesignSystem", package: "DesignSystem"),
            ]
        ),
        .testTarget(name: "FeatureOnboardingTests", dependencies: ["FeatureOnboarding"]),
        .target(
            name: "FeatureHome",
            dependencies: [
                .product(name: "ReaderDomain", package: "ReaderDomain"),
                .product(name: "DesignSystem", package: "DesignSystem"),
            ]
        ),
        .testTarget(name: "FeatureHomeTests", dependencies: ["FeatureHome"]),
        .target(
            name: "FeaturePlayer",
            dependencies: [
                .product(name: "ReaderDomain", package: "ReaderDomain"),
                .product(name: "DesignSystem", package: "DesignSystem"),
            ]
        ),
        .testTarget(name: "FeaturePlayerTests", dependencies: ["FeaturePlayer"]),
    ],
    swiftLanguageModes: [.v6]
)
