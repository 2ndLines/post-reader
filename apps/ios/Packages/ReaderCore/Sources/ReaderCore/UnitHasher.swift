import CryptoKit
import Foundation

/// 摘要（packages/canonical-spec/SPEC.md §3）：H = hex(SHA256(lp(unitId) ‖ lp(authorId) ‖ lp(cleanText)))。
public enum UnitHasher {
    /// lp(x) = uint32_be(len(utf8(x))) ‖ utf8(x)
    public static func lp(_ value: String) -> Data {
        let bytes = Data(value.utf8)
        var length = UInt32(bytes.count).bigEndian
        var out = Data(bytes: &length, count: 4)
        out.append(bytes)
        return out
    }

    public static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// cleanText 必须是 `Cleaner.clean` 的输出；unitId、authorId 按原值参与
    public static func hash(unitId: String, authorId: String, cleanText: String) -> String {
        sha256Hex(lp(unitId) + lp(authorId) + lp(cleanText))
    }
}
