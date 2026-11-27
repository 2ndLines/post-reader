import Foundation
import GRDB

/// 加密主库（01 §9.1）：GRDB + SQLCipher。密钥为 Keychain 中的 32 字节随机数，以 SQLCipher 原始密钥形式使用（不经 KDF）。
/// 文件：Application Support/db/main.sqlite，不进备份，文件保护 completeUntilFirstUserAuthentication。受保护路径。
public final class AppDatabase: Sendable {
    public let writer: DatabasePool

    /// 打开（不存在则创建）并执行迁移
    public init(path: String, keychain: some KeychainStoring) throws {
        let key = try keychain.key(.databaseKey)
        var config = Configuration()
        let hexKey = key.map { String(format: "%02x", $0) }.joined()
        config.prepareDatabase { db in
            try db.usePassphrase("x'\(hexKey)'")
        }
        writer = try DatabasePool(path: path, configuration: config)
        try Self.migrator.migrate(writer)
    }

    /// 默认位置；创建目录并设置不备份与文件保护
    public static func defaultURL(fileManager: FileManager = .default) throws -> URL {
        let support = try fileManager.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        var directory = support.appendingPathComponent("db", isDirectory: true)
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        return directory.appendingPathComponent("main.sqlite")
    }

    /// 迁移只追加（05 §4.4）。表结构见 01 §9.2。
    static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1") { db in
            try db.create(table: "post_snapshot") { t in
                t.primaryKey("post_key", .text)
                t.column("site", .text).notNull()
                t.column("url", .text).notNull()
                t.column("cache_scope", .text).notNull()
                t.column("canonical_json", .blob)
                t.column("title", .text)
                t.column("captured_at", .datetime).notNull()
                t.column("favorited", .boolean).notNull().defaults(to: false)
                t.column("compact_after", .datetime)
            }
            try db.create(table: "unit_hash") { t in
                t.column("post_key", .text).notNull().references("post_snapshot", onDelete: .cascade)
                t.column("unit_id", .text).notNull()
                t.column("hash", .text).notNull()
                t.primaryKey(["post_key", "unit_id"])
            }
            try db.create(table: "queue_item") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("post_key", .text).notNull().indexed()
                t.column("position", .double).notNull()
                t.column("capture_state", .text).notNull()
                t.column("idempotency_key", .text).notNull()
                t.column("added_at", .datetime).notNull()
            }
            try db.create(table: "audio_segment") { t in
                t.column("version_key", .text).notNull()
                t.column("seq", .integer).notNull()
                t.column("unit_id", .text).notNull()
                t.column("file", .text).notNull()
                t.column("bytes", .integer).notNull()
                t.column("audio_sha256", .text).notNull()
                t.column("duration_ms", .integer).notNull()
                t.column("site", .text).notNull()
                t.column("last_played_at", .datetime)
                t.primaryKey(["version_key", "seq"])
            }
            try db.create(index: "audio_segment_lru", on: "audio_segment", columns: ["last_played_at"])
            try db.create(table: "playback_progress") { t in
                t.primaryKey("post_key", .text)
                t.column("version_key", .text).notNull()
                t.column("seq", .integer).notNull()
                t.column("offset_ms", .integer).notNull()
            }
            try db.create(table: "site_session") { t in
                t.primaryKey("site", .text)
                t.column("logged_in", .boolean).notNull()
                t.column("updated_at", .datetime).notNull()
            }
            try db.create(table: "config_bundle") { t in
                t.primaryKey("version", .text)
                t.column("signature", .blob).notNull()
                t.column("payload", .blob).notNull()
                t.column("activated_at", .datetime)
            }
            try db.create(table: "local_notice") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("kind", .text).notNull()
                t.column("post_key", .text)
                t.column("site", .text)
                t.column("created_at", .datetime).notNull()
                t.column("read", .boolean).notNull().defaults(to: false)
            }
            try db.create(table: "setting") { t in
                t.primaryKey("key", .text)
                t.column("value", .blob).notNull()
            }
        }
        migrator.registerMigration("v2") { db in
            try db.create(table: "diag_event") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("kind", .text).notNull()
                t.column("payload", .blob).notNull()
                t.column("essential", .boolean).notNull()
                t.column("created_at", .datetime).notNull()
            }
            try db.alter(table: "local_notice") { t in
                t.add(column: "target", .text)
            }
        }
        return migrator
    }
}
