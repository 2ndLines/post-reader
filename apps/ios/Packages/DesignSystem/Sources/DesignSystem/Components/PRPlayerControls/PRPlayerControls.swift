import SwiftUI

/// 播放页主控件（01 §5.2）：上一篇、上一章、播放 / 暂停、下一章、下一篇；倍速显示在下方。
/// 上一章 / 下一章语义同耳机（PRD 8.4）；首位时上一篇禁用（iOS PRD IOS-PLAY-12）。每个按钮都有朗读标签。
public struct PRPlayerControls: View {
    public enum State: Sendable { case playing, paused, buffering }

    private let state: State
    private let canPrevPost: Bool
    private let canNextPost: Bool
    private let rate: Double
    private let onPrevPost: () -> Void
    private let onPrevChapter: () -> Void
    private let onPlayPause: () -> Void
    private let onNextChapter: () -> Void
    private let onNextPost: () -> Void

    public init(
        state: State,
        canPrevPost: Bool,
        canNextPost: Bool = true,
        rate: Double = 1,
        onPrevPost: @escaping () -> Void,
        onPrevChapter: @escaping () -> Void,
        onPlayPause: @escaping () -> Void,
        onNextChapter: @escaping () -> Void,
        onNextPost: @escaping () -> Void
    ) {
        self.state = state
        self.canPrevPost = canPrevPost
        self.canNextPost = canNextPost
        self.rate = rate
        self.onPrevPost = onPrevPost
        self.onPrevChapter = onPrevChapter
        self.onPlayPause = onPlayPause
        self.onNextChapter = onNextChapter
        self.onNextPost = onNextPost
    }

    public var body: some View {
        VStack(spacing: PRSpace.s) {
            HStack(spacing: PRSpace.l) {
                control("backward.end.fill", label: "上一篇", enabled: canPrevPost, action: onPrevPost)
                control("gobackward", label: "上一章", action: onPrevChapter)
                Button(action: onPlayPause) {
                    Group {
                        if state == .buffering {
                            ProgressView().tint(PRColor.textInverse)
                        } else {
                            Image(systemName: state == .playing ? PRIcon.pause : PRIcon.play)
                                .font(PRFont.title)
                        }
                    }
                    .foregroundStyle(PRColor.textInverse)
                    .frame(width: 64, height: 64)
                    .background(PRColor.accent, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(state == .playing ? Text("暂停") : Text("播放"))
                control("goforward", label: "下一章", action: onNextChapter)
                control("forward.end.fill", label: "下一篇", enabled: canNextPost, action: onNextPost)
            }
            Text(String(format: "%.1f×", rate))
                .font(PRFont.footnote.monospacedDigit())
                .foregroundStyle(PRColor.textSecondary)
                .accessibilityLabel(Text("播放速度 \(String(format: "%.1f", rate)) 倍"))
        }
    }

    private func control(
        _ icon: String,
        label: LocalizedStringKey,
        enabled: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(PRFont.title3)
                .foregroundStyle(PRColor.textPrimary)
                .frame(width: PRSize.minTapTarget, height: PRSize.minTapTarget)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
        .accessibilityLabel(Text(label))
    }
}

#Preview("PRPlayerControls") {
    PRPlayerControls(
        state: .playing, canPrevPost: false,
        onPrevPost: {}, onPrevChapter: {}, onPlayPause: {}, onNextChapter: {}, onNextPost: {}
    )
    .padding()
    .background(PRColor.bgPrimary)
}
