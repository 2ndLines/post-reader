// swift-tools-version: 6.0
// APIClient：由 swift-openapi-generator 构建插件从 Sources/APIClient/openapi.yaml 生成（01 §3、05 §4.5）。
// openapi.yaml 是 packages/contracts/dist/openapi.yaml 的副本，由 `pnpm contracts:gen` 写入；生成代码不入库、不手改。
import PackageDescription

let package = Package(
    name: "APIClient",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "APIClient", targets: ["APIClient"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", .upToNextMinor(from: "1.14.4")),
        .package(url: "https://github.com/apple/swift-openapi-runtime", .upToNextMinor(from: "1.13.4")),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", .upToNextMinor(from: "1.4.0")),
    ],
    targets: [
        .target(
            name: "APIClient",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .testTarget(name: "APIClientTests", dependencies: ["APIClient"]),
    ],
    swiftLanguageModes: [.v6]
)
