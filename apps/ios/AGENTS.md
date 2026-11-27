# apps/ios · iOS 客户端规则

先读根目录 [AGENTS.md](../../AGENTS.md)；本文件只补充本端约定，不得与根规则冲突（playbook §0.1）。
依据：架构 [01](../../docs/archs/01-ios-client.md) §2、§21、§23；playbook §8.1、§9.4。

## 命令（P4-IOS-01 起可用）
- `make -C apps/ios project`：由 `project.yml` 生成工程（XcodeGen）
- `make -C apps/ios lint test`：SwiftLint、SwiftFormat 检查与模拟器测试；宣称完成前必须通过
- `make -C apps/ios format`：SwiftFormat 改写；`make -C apps/ios build`：只构建
- `make project` 先执行 `Vendor/fetch-grdb.sh`：取得 GRDB 源码并启用 SQLCipher（摘要校验，ADR 0019）；`Vendor/GRDB/` 不入库
- 工具版本由根 `.mise.toml` 固定（xcodegen、swiftlint、swiftformat），Makefile 经 `mise exec` 调用
- 需要看界面时：`xcrun simctl io booted screenshot <文件>`，截图附在 PR 中

## 工程与目录
- 不修改、不提交 `.xcodeproj`；只改 `project.yml` 与 `Package.swift`，然后执行 `make project`
- 模块在 `Packages/`（SPM）；`App/` 是主 App，`ShareExtension/` 是分享扩展，`Config/` 是 xcconfig
- 分层：Features 只能依赖 ReaderDomain 与 DesignSystem；系统能力（Keychain、音频会话、后台任务、StoreKit）只通过 Infra 包里经过人工验证的封装调用
- 新页面用 `add-swiftui-screen` 模板：Model + Screen + Preview + 快照测试

## API 基线
- iOS 18 部署目标，Xcode 27 / iOS 27 SDK 构建，Swift 6 语言模式
- 使用 `@Observable`、async/await、actor、StoreKit 2
- 不使用 `ObservableObject`（Share Extension 例外）、回调式 API、`DispatchQueue` 加锁
- 不用 `@unchecked Sendable`、`nonisolated(unsafe)` 压制并发错误

## 视觉
- 只用 `DesignSystem` token，页面不写死颜色与字号；以冻结原型为准
- Liquid Glass 只用于导航与控制层（ADR 0015，01 §23）
- 快照测试在 iOS 18 与 iOS 27 两个模拟器上各跑一遍
- 帖子卡片不显示任何计数

## 红线
- 不记录正文、评论、译文、URL、Cookie；不在 App Group 存凭证
- 不弱化证书固定、摘要校验、App Attest；不引入分析或广告 SDK

## 受保护路径（必须负责人审阅，见 `.github/CODEOWNERS`）
- `Packages/Storage/**`、`Packages/Networking/**`、`Packages/Commerce/**`
- `Packages/Audio/Sources/Audio/NowPlayingBridge*`
- `App/*.entitlements`、`App/Info.plist`、`Config/Pins.xcconfig`

## 需真机验证
CarPlay、线控、锁屏、来电中断、App Attest、Share Extension 内存、订阅购买。这些项由助手在 PR 中列成「需真机验证」清单，交负责人验证。
