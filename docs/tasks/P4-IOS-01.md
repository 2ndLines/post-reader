# P4-IOS-01 iOS 工程基座

## 目标
建立可在模拟器上构建与测试的 iOS 工程，包括以下各项：
- XcodeGen 工程与 SPM 包骨架（依赖方向按 01 §3）
- xcconfig、能力与 entitlements
- SwiftLint / SwiftFormat 与 `make` 命令
- Xcode Cloud 的克隆后脚本

## 依据
- 手册：playbook §6.6（P4-IOS-01）
- 架构：01 §2（目录结构）、§3（模块与依赖）、§4.1–§4.3（工程配置、能力、双 Bundle ID）；05 §4.4（XcodeGen、SwiftLint、SwiftFormat 已定）、§5.1、§5.4（Xcode Cloud）
- 规则：`apps/ios/AGENTS.md`

## 交付物
- `.mise.toml`：`xcodegen` 2.48.0、`swiftlint` 0.65.1、`swiftformat` 0.64.7（都是发布满 3 天的版本）
- `apps/ios/project.yml`、`Makefile`、`.swiftlint.yml`、`.swiftformat`、`Config/*.xcconfig`
- `App/`（入口、`Info.plist`、entitlements、隐私清单、资源目录）、`ShareExtension/`、`UITests/`（启动冒烟）
- 包骨架：`Storage`（含 `StorageInbox`）、`Networking`、`Capture`（含 `CaptureDirect`）、`Audio`、`Commerce`、`ReaderDomain`、`DesignSystem`、`Features`（`FeatureOnboarding`、`FeatureHome`、`FeaturePlayer`）、`TestSupport`，每个 target 有一条链接测试
- `ci_scripts/ci_post_clone.sh`（Xcode Cloud）；`.gitignore` 忽略生成的工程
- `ReaderCore`、`APIClient` 只做 SwiftFormat 排版与一处长行拆分，逻辑不变

## 验收标准（助手起草，2026-11-27；负责人确认前视为草案）
1. `make -C apps/ios project` 生成工程，重复生成不改动仓库中的任何文件 —— 命令输出与文件摘要比对
2. `make -C apps/ios build` 在 iOS 27.2 模拟器上构建成功 —— 命令输出
3. `make -C apps/ios test`：启动冒烟（UI 测试）与全部包测试通过，含 ReaderCore 的 51 条黄金向量 —— 命令输出
4. `make -C apps/ios lint`：SwiftLint `--strict` 与 SwiftFormat `--lint` 无违规；自定义规则禁止 `ObservableObject`、`@unchecked Sendable`、`nonisolated(unsafe)` 与 `DispatchQueue` 加锁 —— 命令输出
5. 依赖方向：`Features` 只声明 `ReaderDomain` 与 `DesignSystem`，Share Extension 只依赖 `ReaderCore`、`StorageInbox`、`CaptureDirect` —— `Package.swift` 与 `project.yml`
6. 仓库级检查（Biome、链接、CODEOWNERS、knip）与 `contracts` 工作流通过

## 范围外
- Xcode Cloud 工作流（`PR`、`Main`、`Release`）的创建、签名与 TestFlight：都需要 Apple 开发者账号，在 App Store Connect 中配置（负责人）。仓库里只放克隆后脚本。
- 国内版的第二个 App 目标：等 D1（双 Bundle ID 还是单一 Bundle ID）确定，见 01 §4.3。
- 证书固定（`Pins.xcconfig`、`NSPinnedDomains`）：P4-IOS-04。
- CarPlay Audio 能力：需要向 Apple 申请，获批后加入。
- iOS 18 模拟器上的测试：本机只装了 iOS 27.2 运行时（Q3）。

## 上下文摘要（助手填写）
填写于 2026-11-27，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p3-pipe-02a` 上（只是为了保持一条 PR 链，代码上互不依赖）。

- 01 §2、§3 给出了目录与包依赖图，§4.1 给出了 `project.yml` 节选：Swift 6、严格并发、开启脚本沙盒、iOS 18 部署目标。
- 05 把 XcodeGen、SwiftLint、SwiftFormat 登记为「已定」，版本由 mise 固定，所以不另写依赖 ADR。
- 本机环境：Xcode 27.2，模拟器运行时只有 iOS 27.2。

## 计划（助手填写）
- **工程描述**：用 XcodeGen 的 `INFOPLIST_FILE` 与 `CODE_SIGN_ENTITLEMENTS` 构建设置引用仓库中的文件，不用它的 `info` 与 `entitlements` 选项。那两个选项会按 `properties` 重新生成文件，实测覆盖了手写内容。
- **签名**：模拟器构建用 `CODE_SIGNING_ALLOWED=NO`，不需要 Team ID。能力文件中的 App Group、钥匙串组、App Attest 环境都由 xcconfig 变量填入。
- **测试方案**：scheme 的测试目标包含 UI 启动冒烟与全部本地包的测试 target，一条 `make test` 全部跑完。

## 风险与问题（助手填写）
- **Q1 Bundle ID 与 Team ID**：目前为占位值 `com.example.postreader`。双 Bundle ID 的取舍（D1）与开发者账号都需要负责人提供。
- **Q2 SwiftLint 不放在构建阶段**：01 §4.1 写了 `preBuildScripts: swiftlint --strict`。但开启 `ENABLE_USER_SCRIPT_SANDBOXING` 后，脚本只能读取声明的输入文件，实测被沙盒拒绝。逐个声明全部源文件不可维护，关闭沙盒又会降低构建安全性。所以改为由 `make lint`、Xcode Cloud 与 CI 执行 lint。
- **Q3 iOS 18 模拟器**：apps/ios/AGENTS.md 要求快照测试在 iOS 18 与 iOS 27 上各跑一遍。本机没有 iOS 18 运行时，需要下载（数 GB）。快照测试从 P4-IOS-02 开始，届时由负责人决定是否在本机安装，或者只在 Xcode Cloud 上跑。
- **Q4 SwiftLint 规则的调整**：
  - `identifier_name` 的最短长度放宽为 1：ReaderCore 的码点循环使用单字母变量。
  - 尾随逗号改为与 SwiftFormat 一致的「必须有」。
- **R1 GitHub CI**：iOS 的正式构建在 Xcode Cloud。GitHub 的 `contracts` 工作流只覆盖 ReaderCore 与 APIClient，本卡不新增 GitHub 上的 iOS 构建。

## 交接记录（会话结束时填写）
**2026-11-27 · AC1–AC5 已在本机验证；AC6 见 PR 的 CI**
- **AC1**：连续两次 `make project` 后，`Info.plist` 与 entitlements 的 MD5 不变，`git status` 中没有生成物。
- **AC2**：`** BUILD SUCCEEDED **`（iPhone 18 Pro，iOS 27.2 模拟器）。
- **AC3**：`** TEST SUCCEEDED **`。
  - UI 启动冒烟用时 5.3 s。
  - 34 条 Swift Testing 用例全部通过，其中黄金向量 51 组在模拟器上通过。
  - APIClient 在宿主机上 `swift test` 通过。
- **AC4**：`0/47 files require formatting`，SwiftLint 无输出。
- **下一步**：P4-IOS-02（DesignSystem）。需要先确认冻结原型的来源，以及 Q3。
