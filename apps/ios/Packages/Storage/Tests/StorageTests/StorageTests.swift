import Foundation
import GRDB
@testable import Storage
import Synchronization
import Testing

/// 内存 Keychain（测试用）
final class MemoryKeychain: KeychainStoring {
    private let items = Mutex<[KeychainItem: Data]>([:])

    func read(_ item: KeychainItem) throws -> Data? {
        items.withLock { $0[item] }
    }

    func write(_ data: Data, for item: KeychainItem) throws {
        items.withLock { $0[item] = data }
    }

    func delete(_ item: KeychainItem) throws {
        _ = items.withLock { $0.removeValue(forKey: item) }
    }
}

private func tempPath() -> String {
    FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).sqlite").path
}

@Suite("加密主库（01 §9）")
struct StorageTests {
    @Test("迁移 v1、v2 建出 01 §9.2 的全部表；重复打开不重复迁移")
    func migrations() throws {
        let path = tempPath()
        let keychain = MemoryKeychain()
        let db = try AppDatabase(path: path, keychain: keychain)
        let tables = try db.writer.read { db in
            try String.fetchSet(db, sql: "SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        let expected: Set = [
            "post_snapshot", "unit_hash", "queue_item", "audio_segment", "playback_progress",
            "site_session", "config_bundle", "local_notice", "setting", "diag_event",
        ]
        #expect(expected.isSubset(of: tables))
        let applied = try db.writer.read { try AppDatabase.migrator.appliedMigrations($0) }
        #expect(applied == ["v1", "v2"])
        _ = try AppDatabase(path: path, keychain: keychain)
    }

    @Test("文件是密文：写入的正文不以明文出现在磁盘上")
    func encryptedOnDisk() throws {
        let path = tempPath()
        let db = try AppDatabase(path: path, keychain: MemoryKeychain())
        try db.writer.write { db in
            try db.execute(
                sql: "INSERT INTO setting (key, value) VALUES (?, ?)",
                arguments: ["marker", Data("PLAINTEXT-MARKER-合成".utf8)]
            )
        }
        try db.writer.writeWithoutTransaction { try $0.checkpoint(.truncate) }
        for suffix in ["", "-wal"] {
            let bytes = (try? Data(contentsOf: URL(fileURLWithPath: path + suffix))) ?? Data()
            #expect(bytes.range(of: Data("PLAINTEXT-MARKER".utf8)) == nil)
            #expect(bytes.range(of: Data("SQLite format 3".utf8)) == nil)
        }
    }

    @Test("密码擦除：删除 Keychain 中的密钥后，库文件无法再打开")
    func cryptoErase() throws {
        let path = tempPath()
        let keychain = MemoryKeychain()
        do {
            let db = try AppDatabase(path: path, keychain: keychain)
            try db.writer.write { db in
                try db.execute(sql: "INSERT INTO setting (key, value) VALUES ('k', x'01')")
            }
        }
        try keychain.delete(.databaseKey)
        // 新生成的密钥打不开原来的文件
        #expect(throws: DatabaseError.self) {
            _ = try AppDatabase(path: path, keychain: keychain)
        }
    }

    @Test("密钥：首次生成 32 字节随机数并保存，之后读取同一把")
    func keyGeneration() throws {
        let keychain = MemoryKeychain()
        let first = try keychain.key(.databaseKey)
        #expect(first.count == 32)
        #expect(try keychain.key(.databaseKey) == first)
        #expect(try keychain.key(.audioKey) != first)
    }
}
