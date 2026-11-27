import SwiftUI

/// 发送验证码的倒计时状态（PRD 7.3：两分钟内只能发送一次，与服务端 120 s 冷却一致）。纯值类型，便于测试。
public struct CountdownState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case idle
        case counting(remaining: Int)
        case resend
    }

    public let seconds: Int
    public private(set) var sentAt: Date?

    public init(seconds: Int = 120, sentAt: Date? = nil) {
        self.seconds = seconds
        self.sentAt = sentAt
    }

    public mutating func markSent(at date: Date) {
        sentAt = date
    }

    public func phase(at now: Date) -> Phase {
        guard let sentAt else { return .idle }
        let remaining = seconds - Int(now.timeIntervalSince(sentAt).rounded(.down))
        return remaining > 0 ? .counting(remaining: remaining) : .resend
    }
}

/// 发送验证码按钮（01 §5.2）：idle「发送验证码」→ counting「n 秒后重发」（禁用）→ resend「重新发送」。
public struct PRCountdownButton: View {
    @Binding private var state: CountdownState
    private let onSend: () -> Void

    public init(state: Binding<CountdownState>, onSend: @escaping () -> Void) {
        _state = state
        self.onSend = onSend
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            CountdownPhaseButton(phase: state.phase(at: context.date)) {
                state.markSent(at: .now)
                onSend()
            }
        }
    }
}

/// 按阶段渲染的按钮（与时间无关，快照测试直接使用）
struct CountdownPhaseButton: View {
    let phase: CountdownState.Phase
    let action: () -> Void

    var body: some View {
        PRButton(title, role: .secondary, action: action)
            .disabled(isCounting)
    }

    private var isCounting: Bool {
        if case .counting = phase {
            return true
        }
        return false
    }

    private var title: LocalizedStringKey {
        switch phase {
        case .idle: "发送验证码"
        case let .counting(remaining): "\(remaining) 秒后重发"
        case .resend: "重新发送"
        }
    }
}

#Preview("PRCountdownButton") {
    @Previewable @State var state = CountdownState()
    PRCountdownButton(state: $state) {}
        .padding()
        .background(PRColor.bgPrimary)
}
