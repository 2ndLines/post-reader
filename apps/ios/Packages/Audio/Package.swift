// swift-tools-version: 6.0
// Audio：播放引擎、本机语音、离线翻译、Now Playing、提示音（01 §3、§12）。
// 依赖方向由本文件的 dependencies 强制（01 §3）。macOS 平台仅用于在宿主机上运行 `swift test`；产品目标为 iOS 18。
import PackageDescription

let package = Package(
    name: "Audio",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "Audio", targets: ["Audio"]),
    ],
    dependencies: [
        .package(path: "../ReaderCore"),
    ],
    targets: [
        .target(name: "Audio", dependencies: [.product(name: "ReaderCore", package: "ReaderCore")]),
        .testTarget(name: "AudioTests", dependencies: ["Audio"]),
    ],
    swiftLanguageModes: [.v6]
)
