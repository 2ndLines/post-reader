# 0019 iOS 加密库：GRDB 源码加官方 SQLCipher 包（V2 结论）

- 状态：提议（实测完成，待负责人批准；GRDB、SQLCipher 属安全敏感依赖，05 §5.5）
- 日期：2026-11-27

## 背景

01 §9.1 规定主库用 GRDB + SQLCipher，打开时从 Keychain 取 32 字节密钥。05 §1.2 的 V2 要求在 P4 首个存储任务中验证 SPM 的集成方式（主 App 与 Share Extension 共用），不行时「换用 SQLCipher 官方 SPM 包 + GRDB 的自定义构建方式；仍不行则停下报告」。

## 证据（2026-11-27）

- **GRDB 的现状**：GRDB 7.12.0（2026-11-01）的 README「Encryption」写明，经 SPM 使用 SQLCipher 必须 fork GRDB 并修改 `Package.swift`。它的 `Package.swift` 中有以「GRDB+SQLCipher」标注的注释行，说明要改哪些地方：
  - 引入 `SQLCipher.swift`
  - 定义 `SQLITE_HAS_CODEC`
  - 删除 `GRDBSQLite`，启用 `GRDBSQLCipher`
  - GRDB 没有提供开关或 trait。
- **SQLCipher 官方包**：`sqlcipher/SQLCipher.swift` 4.20.0（2026-10-27）以 xcframework 二进制目标发布，SPM 按包内写死的 checksum 校验。许可证为 SQLCipher 社区版的 BSD 风格许可证（GitHub 识别为 NOASSERTION），GRDB 为 MIT。
- **实测**（Xcode 27.2，iOS 27.2 模拟器；P4-IOS-03）：
  - 用原始密钥（`x'…'`，不经 KDF）打开 `DatabasePool`，迁移 v1、v2 成功。
  - 磁盘文件与 WAL 中找不到写入的明文，也没有 `SQLite format 3` 文件头。
  - 删除 Keychain 中的密钥后，用新密钥打开原文件失败（`SQLITE_NOTADB`），密码擦除成立。
  - App、Share Extension 与全部测试都能构建。

## 决定

1. **不在 GitHub 上 fork**：维护 fork 需要新仓库与长期同步。改为构建前取得上游源码，再按上游注释修改清单（`apps/ios/Vendor/fetch-grdb.sh`）：
   - 下载固定 tag 的源码包，校验 SHA-256。
   - 校验上游 `Package.swift` 的 SHA-256，上游改动时停下，要求人工重新核对。
   - 用仓库中的 `apps/ios/Vendor/GRDB.Package.swift` 覆盖原清单。与上游的差异只有注释标出的那几处，`SQLCipher.swift` 固定为 `exact: 4.20.0`。
   - 源码放在 `apps/ios/Vendor/GRDB/`，不入库。`make project` 与 Xcode Cloud 的 `ci_post_clone.sh` 都会调用这个脚本。
2. **密钥**：32 字节随机数存于 Keychain（`crypto` / `db`，`AfterFirstUnlockThisDeviceOnly`，不同步），以 SQLCipher 原始密钥使用。密码擦除只需删除这把密钥。
3. **升级流程**：升级 GRDB 时同时更新三项：版本号、源码包摘要、上游清单摘要，并重新生成 `GRDB.Package.swift`。升级 SQLCipher 时修改其中的 `exact` 版本。两者都按 05 §5.5 由负责人审阅。

## 影响

- **Share Extension**：共享收件箱库（`StorageInbox`）在 P7 实现时直接使用同一个 GRDB 包。按 GRDB 文档，共享容器中的库要设置 `cipher_plaintext_header_size` 以避免 0xDEAD10CC，到时在该任务中验证。
- **模拟器签名**：需要真实的 Keychain 访问（-34018 问题），所以模拟器构建改为临时签名（`CODE_SIGN_IDENTITY=-`）。不再使用 `CODE_SIGNING_ALLOWED=NO`。
- **构建依赖网络**：首次 `make project` 需要访问 GitHub。之后有缓存，不重复下载。
