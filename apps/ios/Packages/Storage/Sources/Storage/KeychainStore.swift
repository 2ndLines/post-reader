import Foundation
import Security

/// Keychain 条目（01 §15.1）。所有条目不同步到 iCloud（kSecAttrSynchronizable = false），
/// 可访问性 AfterFirstUnlockThisDeviceOnly。受保护路径。
public enum KeychainItem: Sendable, Hashable {
    case databaseKey
    case inboxKey
    case audioKey

    var service: String {
        "crypto"
    }

    var account: String {
        switch self {
        case .databaseKey: "db"
        case .inboxKey: "inbox"
        case .audioKey: "audio"
        }
    }
}

public enum KeychainError: Error, Equatable {
    case unexpectedStatus(OSStatus)
}

/// Keychain 的最小接口：便于在测试中替换为内存实现
public protocol KeychainStoring: Sendable {
    func read(_ item: KeychainItem) throws -> Data?
    func write(_ data: Data, for item: KeychainItem) throws
    func delete(_ item: KeychainItem) throws
}

public extension KeychainStoring {
    /// 读取 32 字节密钥；不存在时生成随机密钥并写入（01 §9.1）
    func key(_ item: KeychainItem) throws -> Data {
        if let existing = try read(item) {
            return existing
        }
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
        let key = Data(bytes)
        try write(key, for: item)
        return key
    }
}

/// 系统 Keychain 实现。accessGroup 为 nil 时只在主 App 内可见；共享条目由调用方传入访问组。
public struct KeychainStore: KeychainStoring {
    private let accessGroup: String?

    public init(accessGroup: String? = nil) {
        self.accessGroup = accessGroup
    }

    private func query(_ item: KeychainItem) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: item.service,
            kSecAttrAccount as String: item.account,
            kSecAttrSynchronizable as String: false,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    public func read(_ item: KeychainItem) throws -> Data? {
        var query = query(item)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess: return result as? Data
        case errSecItemNotFound: return nil
        default: throw KeychainError.unexpectedStatus(status)
        }
    }

    public func write(_ data: Data, for item: KeychainItem) throws {
        var attributes = query(item)
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let update = SecItemUpdate(query(item) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            guard update == errSecSuccess else {
                throw KeychainError.unexpectedStatus(update)
            }
            return
        }
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    public func delete(_ item: KeychainItem) throws {
        let status = SecItemDelete(query(item) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }
}
