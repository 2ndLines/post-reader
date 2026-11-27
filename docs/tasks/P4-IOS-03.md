# P4-IOS-03 Storage：加密主库、迁移 v1、Keychain 封装、密码擦除测试

## 目标
实现 `Storage` 的基础，并完成 05 §1.2 的 V2 验证（GRDB + SQLCipher 的 SPM 集成方式）：
- 加密主库（GRDB + SQLCipher）
- 迁移 v1、v2（01 §9.2）
- Keychain 封装（01 §15.1）
- 密码擦除测试

## 依据
- 手册：playbook §6.6（P4-IOS-03）
- 架构：01 §9.1、§9.2、§15.1；05 §1.2（V2）、§4.4（GRDB）、§5.5（安全敏感依赖）
- ADR：0019（本卡提议）

## 交付物
- `Storage`：
  - `KeychainStore`：系统实现与 `KeychainStoring` 协议；条目、可访问性与不同步按 01 §15.1
  - `AppDatabase`：SQLCipher 原始密钥；迁移 v1、v2；默认位置不进备份，并设置文件保护
- `apps/ios/Vendor/fetch-grdb.sh` 与 `GRDB.Package.swift`：取得 GRDB 源码并启用 SQLCipher，带两级摘要校验
- `PostReaderTests`：以 App 为宿主的单元测试目标，系统 Keychain 的测试放在这里
- 模拟器构建改为临时签名：Keychain 需要签名环境
- 文档：ADR 0019；05 中 V2 的结论与依赖登记

## 验收标准（助手起草，2026-11-27；负责人确认前视为草案）
1. 迁移 v1、v2 建出 01 §9.2 的全部表；重复打开不重复迁移 —— 包测试
2. 磁盘上的库文件与 WAL 中没有明文，也没有 SQLite 文件头 —— 包测试
3. 密码擦除：删除 Keychain 中的密钥后，库无法再打开 —— 包测试
4. 密钥首次生成 32 字节随机数，之后读取同一把；系统 Keychain 的写入、覆盖、读取、删除 —— 包测试与 App 宿主测试
5. GRDB 源码包与上游清单的摘要不符时，构建停止 —— 脚本逻辑（固定的摘要值）
6. `make lint`、`make test` 通过（含已有的快照与 UI 冒烟） —— 命令输出

## 范围外
- 仓储（Repositories）、音频缓存加密、共享收件箱库（`StorageInbox` 用 SQLCipher，P7，见 ADR 0019 影响）、磁盘预算
- 首次启动时清理钥匙串（01 §15.3）：随 App 装配（P4-IOS-05）一起做

## 上下文摘要（助手填写）
填写于 2026-11-27，在负责人 `/goal` 授权下自行推进。本卡从 `main` 拉出（#1–#29 已合并；#30 与本卡互不依赖）。

- 01 §9.1：打开流程为 `KeychainStore` 取密钥 → `usePassphrase` → `DatabasePool`。
- 05 §1.2 的 V2 是一项待验证的默认选择；不通过时的回退写明为「官方 SQLCipher 包 + GRDB 自定义构建」。
- GRDB 7.12.0 的 README 写明，经 SPM 使用 SQLCipher 必须修改 GRDB 的 `Package.swift`，所以直接走回退方案（ADR 0019）。

## 计划（助手填写）
见 ADR 0019 的「决定」。补充三点：
- **密钥形式**：使用 SQLCipher 的原始密钥形式 `x'<hex>'`。密钥本身就是 32 字节随机数，不需要再经 PBKDF2。
- **测试替身**：包测试用内存版的 Keychain（`Mutex` 保护，不用 `@unchecked Sendable`）。
- **系统 Keychain 的测试**：放在 App 宿主测试中。包的测试目标没有 Keychain 权限，实测返回 -34018。

## 风险与问题（助手填写）
- **Q1 ADR 0019 待批准**：GRDB 与 SQLCipher 都是安全敏感依赖，按 05 §5.5 需负责人审阅。05 中两者的登记状态写为「提议」。
- **Q2 构建时联网**：首次 `make project` 要从 GitHub 下载 GRDB 源码包（有摘要校验）。如果不希望构建时联网，可改为把源码直接放进仓库（约 10 MB）。
- **Q3 模拟器临时签名**：从 `CODE_SIGNING_ALLOWED=NO` 改为 `CODE_SIGN_IDENTITY=-`。真机与发布签名仍需 Apple 账号（Xcode Cloud）。
- **R1 SQLCipher 的日志**：密码擦除测试会在控制台打印一行 `sqlcipher_codec_ctx_set_error`（密钥错误）。这是预期行为，日志中不含密钥与内容。

## 交接记录（会话结束时填写）
**2026-11-27 · AC1–AC6 已在本机验证（Xcode 27.2，iOS 27.2 模拟器）**
- **`make test`**：`** TEST SUCCEEDED **`，44 条 Swift Testing 用例全部通过，另有 UI 冒烟。
  - 包测试：迁移、密文、密码擦除、密钥生成，共 4 条。
  - App 宿主测试：系统 Keychain，共 2 条。
  - 快照 66 张保持一致。
- **`make lint`**：`0/57 files require formatting`，SwiftLint 无输出。
- **V2**：已验证，结论写入 05 §1.2 与 ADR 0019。
- **下一步**：P4-IOS-04（Networking：生成的客户端、中间件链、`JobStreamClient`、证书固定配置）。
