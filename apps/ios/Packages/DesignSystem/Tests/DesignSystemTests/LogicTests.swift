@testable import DesignSystem
import Foundation
import Testing

@Suite("组件逻辑")
struct LogicTests {
    @Test("倒计时：未发送为 idle；发送后 120 s 内为 counting 且剩余秒数递减；到点后为 resend")
    func countdown() {
        var state = CountdownState()
        let start = Date(timeIntervalSince1970: 1000)
        #expect(state.phase(at: start) == .idle)
        state.markSent(at: start)
        #expect(state.phase(at: start) == .counting(remaining: 120))
        #expect(state.phase(at: start.addingTimeInterval(0.9)) == .counting(remaining: 120))
        #expect(state.phase(at: start.addingTimeInterval(119.5)) == .counting(remaining: 1))
        #expect(state.phase(at: start.addingTimeInterval(120)) == .resend)
        state.markSent(at: start.addingTimeInterval(200))
        #expect(state.phase(at: start.addingTimeInterval(201)) == .counting(remaining: 119))
    }

    @Test("验证码只保留 ASCII 数字，最多 length 位（全角数字与字母被丢弃）")
    func codeSanitize() {
        #expect(CodeInput.sanitize("12a3 4-5", length: 6) == "12345")
        #expect(CodeInput.sanitize("1234567", length: 6) == "123456")
        #expect(CodeInput.sanitize("１２３", length: 6) == "")
        #expect(CodeInput.sanitize("", length: 6) == "")
    }

    @Test("进度条：当前章节按累计时长计算，超出总长取最后一章")
    @MainActor
    func scrubberChapter() {
        let chapters: [PRProgressScrubber.Chapter] = [.init(id: "a", durationMs: 10), .init(id: "b", durationMs: 20)]
        let at = { (ms: Int) in PRProgressScrubber(chapters: chapters, positionMs: ms) { _ in }.currentChapterIndex }
        #expect(at(0) == 0)
        #expect(at(9) == 0)
        #expect(at(10) == 1)
        #expect(at(999) == 1)
    }
}
