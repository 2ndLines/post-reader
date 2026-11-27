import Foundation
import Storage
import Testing

/// 系统 Keychain（01 §15.1）：需要 App 宿主，包的测试目标没有 Keychain 权限（-34018）
@Suite("系统 Keychain")
struct KeychainStoreTests {
    @Test("写入、覆盖、读取、删除")
    func roundTrip() throws {
        let keychain = KeychainStore()
        try keychain.delete(.audioKey)
        #expect(try keychain.read(.audioKey) == nil)
        try keychain.write(Data([1, 2, 3]), for: .audioKey)
        try keychain.write(Data([4, 5]), for: .audioKey)
        #expect(try keychain.read(.audioKey) == Data([4, 5]))
        try keychain.delete(.audioKey)
        #expect(try keychain.read(.audioKey) == nil)
    }

    @Test("密钥首次生成后保持不变")
    func generatedKeyPersists() throws {
        let keychain = KeychainStore()
        try keychain.delete(.inboxKey)
        let key = try keychain.key(.inboxKey)
        #expect(key.count == 32)
        #expect(try keychain.key(.inboxKey) == key)
        try keychain.delete(.inboxKey)
    }
}
