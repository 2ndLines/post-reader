# P1-IOS-01 `ReaderCore`：Swift 清洗与摘要实现，读取同一组黄金向量

## 目标
在 `apps/ios/Packages/ReaderCore` 中按 `packages/canonical-spec/SPEC.md` 实现 `Cleaner` 与 `UnitHasher`，并用与 TS 相同的 `vectors/*.json` 做 100% 一致性测试（P1 出口条件的 Swift 一侧）。

## 依据
- 规格：`packages/canonical-spec/SPEC.md`（P1-SPEC-01，草案）
- 架构：01 §3（`ReaderCore` 只依赖 Foundation、CryptoKit）、§19（黄金向量测试读取 `packages/canonical-spec/vectors/*.json`）
- 手册：playbook §6.3、§8.1（API 基线 iOS 18、Swift 6）

## 交付物
- `apps/ios/Packages/ReaderCore/Package.swift`：Swift 6 语言模式；平台 iOS 18、macOS 15（宿主机上可直接 `swift test`）
- `Sources/ReaderCore/Cleaner.swift`、`UnitHasher.swift`
- `Tests/ReaderCoreTests/GoldenVectorTests.swift`（Swift Testing）

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. macOS 宿主机上 `swift test`：51 条向量全部通过，`lp` 与 SHA-256 的手算值通过 —— 输出
2. iOS 模拟器（iOS 27.2）上 `xcodebuild test`：同样全部通过 —— 输出
3. 实现只依赖 Foundation 与 CryptoKit，没有第三方依赖 —— `Package.swift`
4. 两侧规格中的每一步都能在 Swift 中逐字实现；凡是需要偏离 SPEC.md 的地方，先改规格再改实现 —— PR 说明

## 范围外
XcodeGen 工程、Makefile、SwiftLint/SwiftFormat（P4-IOS-01）；把向量复制为测试资源的构建步骤（P4-IOS-01 的 `make project`）。

## 上下文摘要（助手填写）

填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p1-spec-01` 上。

- **规格中的平台相关点**：
  - NFC：Swift 用 `precomposedStringWithCanonicalMapping`。
  - `Emoji` 属性：Swift 用 `Unicode.Scalar.Properties.isEmoji`。
  - 其余各步都是明确的码位区段与顺序。
- **本机环境**：Xcode 27.2 与 Swift 6.4.2 可用；iOS 27.2 模拟器运行时可用。默认的 macOS SDK 查找会指向一个失效的 CommandLineTools 路径，因此运行 `swift test` 时显式设置 `SDKROOT=$(xcrun --sdk macosx --show-sdk-path)`。
- **P4 尚未开始**：iOS 工程（XcodeGen）还不存在，本卡只建 SPM 包。

## 计划（助手填写）
- `Cleaner.clean(_:)`：按 SPEC.md 第 1–6 步，逐码位实现，结构与 TS 参考实现一一对应。
  - 实体解码手写扫描，不用正则，语义与 TS 的正则一致：数字串取最长一段，长度在范围内且后面紧跟 `;` 才算匹配。
- `UnitHasher.hash(unitId:authorId:cleanText:)` 与 `lp(_:)`：用 CryptoKit 的 `SHA256`。
- 测试：通过 `#filePath` 定位仓库中的 `packages/canonical-spec/vectors/`，直接读取，避免复制一份造成两处不一致；P4 引入 `make project` 后再改为构建时复制。

## 风险与问题（助手填写）
- **R1 两侧 Unicode 版本不同**：Node 26 的 ICU 与 iOS 27 / macOS 27 的 Unicode 版本可能不同，NFC 与 `Emoji` 属性对新字符的判定可能不一致。向量只用 Unicode 15.1 及更早的字符。
- **R2 模拟器读取宿主机文件**：测试通过 `#filePath` 读取宿主机上的文件，模拟器中可行；真机测试不适用，届时（P4）改为测试资源。

## 交接记录（会话结束时填写）

**2026-11-26 · AC1–AC4 已完成**

- **AC1**：在 macOS 宿主机上运行 `SDKROOT=$(xcrun --sdk macosx --show-sdk-path) swift test`，输出 `✔ Test "清洗与摘要" with 51 test cases passed`，`lp` 的 4 条手算值、SHA-256 与非幂等用例都通过。
  - **第一次运行，向量读取失败被吞掉了**：路径少算了一级目录，`try?` 把读取失败吞掉，参数化用例在 0 条向量上空跑，并且算作通过，只有「向量集完整」那条用例因为向量数不对而失败。已改为把读取失败的原因记下来，由该用例报告出来。
  - **变异测试**：临时把规则改为不删除制表符，`tab-deleted`、`only-whitespace`、`whitespace-only-lines-become-blank` 三条向量失败；改回后全部通过。
- **AC2**：在 iOS 27.2 模拟器（iPhone 18 Pro）上运行 `xcodebuild test -scheme ReaderCore`，输出 `✔ Test "清洗与摘要" with 51 test cases passed`、`** TEST SUCCEEDED **`。
- **AC3**：`Package.swift` 没有任何依赖，只用到 Foundation 与 CryptoKit。
- **AC4**：SPEC.md 的每一步都按原样实现，没有需要偏离规格的地方。说明 SPEC.md 可以在两侧做到一致。
- **P1 出口条件的第一项已满足**：「TS 与 Swift 两侧黄金向量 100% 通过」。
- **后续**：
  - 在 05 §5.3 的 `contracts` 工作流中加入 macOS 上的 `swift test`，让两侧一致性在每次 CI 中都得到检查，在 P1-CTR-02 一并完成。
  - P4-IOS-01 把向量改为构建时复制的测试资源。
- `.gitignore` 加入 `.build/`、`.swiftpm/`。
