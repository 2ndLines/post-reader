import Foundation
@testable import ReaderCore
import Testing

/// 与 TS 侧共用 packages/canonical-spec/vectors/*.json（01 §19）。
/// P4 引入 `make project` 前，通过 #filePath 定位仓库中的向量目录，不复制副本。
struct Vector: Decodable, Sendable, CustomTestStringConvertible {
    let name: String
    let raw: String
    let unitId: String
    let authorId: String
    let expectedClean: String
    let expectedHash: String
    var testDescription: String {
        name
    }
}

enum Vectors {
    /// 本文件位于 <仓库>/apps/ios/Packages/ReaderCore/Tests/ReaderCoreTests/，向上 7 级是仓库根目录
    static let repoRoot: URL = (0 ..< 7)
        .reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
    static let directory = repoRoot.appendingPathComponent("packages/canonical-spec/vectors")

    static let files = ["bidi", "cjk", "edge-cases", "emoji-zwj", "html-entities", "whitespace", "zero-width"]

    /// 读取失败不得静默变成「0 条向量」：失败原因记在 loadErrors 中，由「向量集完整」用例报告
    static let (all, loadErrors): ([Vector], [String]) = {
        var vectors: [Vector] = []
        var errors: [String] = []
        for file in files {
            let url = directory.appendingPathComponent("\(file).json")
            do {
                vectors += try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
            } catch {
                errors.append("\(url.path): \(error)")
            }
        }
        return (vectors, errors)
    }()
}

@Suite("黄金向量")
struct GoldenVectorTests {
    @Test("向量集完整：7 类文件、名称唯一")
    func vectorSetIsComplete() {
        #expect(Vectors.loadErrors.isEmpty, "向量读取失败：\(Vectors.loadErrors)")
        #expect(Vectors.all.count == 51)
        #expect(Set(Vectors.all.map(\.name)).count == Vectors.all.count)
    }

    @Test("清洗与摘要", arguments: Vectors.all)
    func cleanAndHash(_ vector: Vector) {
        #expect(Cleaner.clean(vector.raw) == vector.expectedClean)
        #expect(UnitHasher.hash(unitId: vector.unitId, authorId: vector.authorId, cleanText: vector.expectedClean)
            == vector.expectedHash)
    }
}

@Suite("lp 与 SHA-256（手算期望值）")
struct HashPrimitiveTests {
    @Test(arguments: [
        ("", "00000000"),
        ("ab", "000000026162"),
        ("你", "00000003e4bda0"),
        ("\u{1F44D}", "00000004f09f918d"),
    ])
    func lp(_ value: String, _ expected: String) {
        #expect(UnitHasher.lp(value).map { String(format: "%02x", $0) }.joined() == expected)
    }

    @Test func sha256Abc() {
        #expect(UnitHasher.sha256Hex(Data("abc".utf8))
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func cleaningIsNotIdempotentForEntityLikeText() {
        let once = Cleaner.clean("&amp;lt;")
        #expect(once == "&lt;")
        #expect(Cleaner.clean(once) == "<")
    }
}
