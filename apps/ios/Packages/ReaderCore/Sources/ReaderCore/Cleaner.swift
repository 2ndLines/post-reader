import Foundation

/// 清洗（packages/canonical-spec/SPEC.md §2，schemaVersion = 1）。
/// 步骤与 TS 参考实现（packages/canonical-spec/src/clean.ts）一一对应，按码位逐步处理。
public enum Cleaner {
    public static let schemaVersion = 1

    public static func clean(_ raw: String) -> String {
        // 第 1 步：解码 HTML 实体（只解码一遍）
        let decoded = decodeEntities(Array(raw.unicodeScalars))
        // 第 2 步：NFC
        let normalized = String(String.UnicodeScalarView(decoded)).precomposedStringWithCanonicalMapping
        // 第 3 步：先统一换行，再删除控制字符
        let withoutControls = unifyNewlines(Array(normalized.unicodeScalars)).filter { !isDeletedControl($0.value) }
        // 第 4、5 步；第 6 步不做 SSML 转义
        let result = normalizeLines(filterJoiners(withoutControls))
        return String(String.UnicodeScalarView(result))
    }

    // MARK: 第 1 步

    private static let namedEntities: [String: Unicode.Scalar] = [
        "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": "\u{00A0}",
    ]
    private static let replacement: Unicode.Scalar = "\u{FFFD}"

    /// 与 TS 正则 `&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));` 等价：
    /// 数字串取最长一段，长度在范围内且其后紧跟 `;` 才算匹配；不匹配时 `&` 原样保留，从下一个码位继续扫描。
    static func decodeEntities(_ input: [Unicode.Scalar]) -> [Unicode.Scalar] {
        var out: [Unicode.Scalar] = []
        out.reserveCapacity(input.count)
        var i = 0
        while i < input.count {
            if input[i] == "&", let (scalar, length) = matchEntity(input, at: i) {
                out.append(scalar)
                i += length
            } else {
                out.append(input[i])
                i += 1
            }
        }
        return out
    }

    private static func matchEntity(_ s: [Unicode.Scalar], at start: Int) -> (Unicode.Scalar, Int)? {
        var j = start + 1
        guard j < s.count else { return nil }
        if s[j] == "#" {
            j += 1
            let isHex = j < s.count && (s[j] == "x" || s[j] == "X")
            if isHex {
                j += 1
            }
            let digitsStart = j
            while j < s.count, isHex ? isHexDigit(s[j]) : isDecimalDigit(s[j]) {
                j += 1
            }
            let digitCount = j - digitsStart
            let maxDigits = isHex ? 6 : 7
            guard digitCount >= 1, digitCount <= maxDigits, j < s.count, s[j] == ";" else { return nil }
            let digits = String(String.UnicodeScalarView(s[digitsStart ..< j]))
            let value = UInt32(digits, radix: isHex ? 16 : 10) ?? 0
            let valid = value > 0 && value <= 0x10FFFF && !(0xD800 ... 0xDFFF).contains(value)
            let scalar = valid ? (Unicode.Scalar(value) ?? replacement) : replacement
            return (scalar, j - start + 1)
        }
        let nameStart = j
        while j < s.count, isAsciiLetter(s[j]) {
            j += 1
        }
        guard j < s.count, s[j] == ";" else { return nil }
        let name = String(String.UnicodeScalarView(s[nameStart ..< j]))
        guard let scalar = namedEntities[name] else { return nil }
        return (scalar, j - start + 1)
    }

    private static func isDecimalDigit(_ c: Unicode.Scalar) -> Bool {
        ("0" ... "9").contains(c)
    }

    private static func isHexDigit(_ c: Unicode.Scalar) -> Bool {
        isDecimalDigit(c) || ("a" ... "f").contains(c) || ("A" ... "F").contains(c)
    }

    private static func isAsciiLetter(_ c: Unicode.Scalar) -> Bool {
        ("a" ... "z").contains(c) || ("A" ... "Z")
            .contains(c)
    }

    // MARK: 第 3 步

    private static let lf: Unicode.Scalar = "\n"

    static func unifyNewlines(_ input: [Unicode.Scalar]) -> [Unicode.Scalar] {
        var out: [Unicode.Scalar] = []
        out.reserveCapacity(input.count)
        var i = 0
        while i < input.count {
            let v = input[i].value
            if v == 0x0D {
                out.append(lf)
                if i + 1 < input.count, input[i + 1] == lf {
                    i += 1
                }
            } else if v == 0x85 || v == 0x2028 || v == 0x2029 {
                out.append(lf)
            } else {
                out.append(input[i])
            }
            i += 1
        }
        return out
    }

    static func isDeletedControl(_ v: UInt32) -> Bool {
        v <= 0x09 || (0x0B ... 0x1F).contains(v) || (0x7F ... 0x9F).contains(v)
            || v == 0xFEFF || v == 0x200B || v == 0x2060
            || (0x202A ... 0x202E).contains(v) || (0x2066 ... 0x2069).contains(v)
    }

    // MARK: 第 4 步

    private static let joiningRanges: [ClosedRange<UInt32>] = [
        0x0600 ... 0x06FF, 0x0700 ... 0x074F, 0x0750 ... 0x077F, 0x07C0 ... 0x07FF,
        0x0860 ... 0x086F, 0x0870 ... 0x089F, 0x08A0 ... 0x08FF, 0x0900 ... 0x0D7F,
        0x0D80 ... 0x0DFF, 0x1800 ... 0x18AF, 0xFB50 ... 0xFDFF, 0xFE70 ... 0xFEFE,
    ]

    private static func isJoiningScript(_ c: Unicode.Scalar?) -> Bool {
        guard let v = c?.value else { return false }
        return joiningRanges.contains { $0.contains(v) }
    }

    private static func isNonAsciiEmoji(_ c: Unicode.Scalar?) -> Bool {
        guard let c else { return false }
        return c.value >= 0x80 && c.properties.isEmoji
    }

    /// 按第 3 步输出中的相邻码位判定每个 ZWNJ/ZWJ，判定完成后统一删除
    static func filterJoiners(_ s: [Unicode.Scalar]) -> [Unicode.Scalar] {
        let zwnj: UInt32 = 0x200C
        let zwj: UInt32 = 0x200D
        let keep = s.indices.map { i -> Bool in
            let v = s[i].value
            guard v == zwnj || v == zwj else { return true }
            let prev = i > 0 ? s[i - 1] : nil
            let next = i + 1 < s.count ? s[i + 1] : nil
            if isJoiningScript(prev), isJoiningScript(next) {
                return true
            }
            guard v == zwj else { return false }
            var j = i - 1
            while j >= 0, s[j].value == 0xFE0F || s[j].value == 0xFE0E {
                j -= 1
            }
            return isNonAsciiEmoji(j >= 0 ? s[j] : nil) && isNonAsciiEmoji(next)
        }
        return s.indices.filter { keep[$0] }.map { s[$0] }
    }

    // MARK: 第 5 步

    private static func isWhitespace(_ c: Unicode.Scalar) -> Bool {
        switch c.value {
        case 0x20, 0xA0, 0x1680, 0x202F, 0x205F, 0x3000, 0x2000 ... 0x200A: true
        default: false
        }
    }

    static func normalizeLines(_ s: [Unicode.Scalar]) -> [Unicode.Scalar] {
        let lines = s.split(separator: lf, omittingEmptySubsequences: false)
        var joined: [Unicode.Scalar] = []
        joined.reserveCapacity(s.count)
        for (index, line) in lines.enumerated() {
            if index > 0 {
                joined.append(lf)
            }
            if !line.allSatisfy(isWhitespace) {
                joined.append(contentsOf: line)
            }
        }
        var collapsed: [Unicode.Scalar] = []
        collapsed.reserveCapacity(joined.count)
        var run = 0
        for c in joined {
            run = c == lf ? run + 1 : 0
            if c != lf || run <= 2 {
                collapsed.append(c)
            }
        }
        let isTrimmed: (Unicode.Scalar) -> Bool = { $0 == lf || isWhitespace($0) }
        guard let first = collapsed.firstIndex(where: { !isTrimmed($0) }),
              let last = collapsed.lastIndex(where: { !isTrimmed($0) })
        else { return [] }
        return Array(collapsed[first ... last])
    }
}
