import SwiftUI

/// 迷你播放条的显示数据
public struct NowPlayingModel: Sendable {
    public enum Status: Sendable { case playing, paused, buffering }

    public let title: String
    public let platformName: String
    /// 当前发言人或状态说明
    public let subtitle: String
    public let status: Status
    /// 本机语音朗读（降级）时显示小标签
    public let isLocalSpeech: Bool
    public let hasNext: Bool

    public init(
        title: String,
        platformName: String,
        subtitle: String,
        status: Status,
        isLocalSpeech: Bool = false,
        hasNext: Bool = true
    ) {
        self.title = title
        self.platformName = platformName
        self.subtitle = subtitle
        self.status = status
        self.isLocalSpeech = isLocalSpeech
        self.hasNext = hasNext
    }
}

/// 底部常驻迷你播放条（01 §5.2；原型 MiniPlayerBar）：高 56 的胶囊，平台首字母、标题与当前发言人、播放 / 暂停、下一篇。
/// nowPlaying 为 nil 时不显示（idle）。悬浮在内容之上，材质暂用系统 regularMaterial，PRGlassSurface（01 §23.4）实现后替换。
public struct PRMiniPlayer: View {
    private let nowPlaying: NowPlayingModel?
    private let onTap: () -> Void
    private let onPlayPause: () -> Void
    private let onNext: () -> Void

    public init(
        nowPlaying: NowPlayingModel?,
        onTap: @escaping () -> Void,
        onPlayPause: @escaping () -> Void,
        onNext: @escaping () -> Void
    ) {
        self.nowPlaying = nowPlaying
        self.onTap = onTap
        self.onPlayPause = onPlayPause
        self.onNext = onNext
    }

    public var body: some View {
        if let nowPlaying {
            HStack(spacing: PRSpace.s) {
                Button(action: onTap) {
                    HStack(spacing: PRSpace.s + 2) {
                        Text(String(nowPlaying.platformName.trimmingCharacters(in: .whitespaces).prefix(1))
                            .uppercased())
                            .font(PRFont.footnote.weight(.bold))
                            .foregroundStyle(PRColor.accent)
                            .frame(width: 32, height: 32)
                            .background(PRColor.accent.opacity(0.12), in: Circle())
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(nowPlaying.title)
                                .font(PRFont.body.weight(.semibold))
                                .foregroundStyle(PRColor.textPrimary)
                                .lineLimit(1)
                            HStack(spacing: PRSpace.xs) {
                                if nowPlaying.isLocalSpeech {
                                    Text("本机语音")
                                        .font(PRFont.caption2)
                                        .foregroundStyle(PRColor.accentOnMuted)
                                        .padding(.horizontal, PRSpace.xs)
                                        .background(PRColor.accentMuted, in: Capsule())
                                }
                                Text(nowPlaying.status == .buffering ? String(localized: "正在准备") : nowPlaying.subtitle)
                                    .font(PRFont.caption2.weight(.regular))
                                    .foregroundStyle(PRColor.textSecondary)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text("打开播放页"))

                Button(action: onPlayPause) {
                    Group {
                        if nowPlaying.status == .buffering {
                            ProgressView().tint(PRColor.accent)
                        } else {
                            Image(systemName: nowPlaying.status == .playing ? PRIcon.pause : PRIcon.play)
                                .font(PRFont.headline)
                        }
                    }
                    .foregroundStyle(PRColor.textPrimary)
                    .frame(width: PRSize.minTapTarget, height: PRSize.minTapTarget)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(nowPlaying.status == .playing ? Text("暂停播放") : Text("继续播放"))

                Button(action: onNext) {
                    Image(systemName: "forward.fill")
                        .font(PRFont.headline)
                        .foregroundStyle(PRColor.textPrimary)
                        .frame(width: PRSize.minTapTarget, height: PRSize.minTapTarget)
                }
                .buttonStyle(.plain)
                .disabled(!nowPlaying.hasNext)
                .opacity(nowPlaying.hasNext ? 1 : 0.45)
                .accessibilityLabel(Text("下一篇"))
            }
            .padding(.leading, PRSpace.m + 2)
            .padding(.trailing, PRSpace.xs + 2)
            .frame(minHeight: 56)
            .background(.regularMaterial, in: Capsule())
            .shadow(color: .black.opacity(0.13), radius: 12, y: 4)
        }
    }
}

#Preview("PRMiniPlayer") {
    VStack(spacing: PRSpace.l) {
        PRMiniPlayer(
            nowPlaying: .init(title: "合成标题：周末去哪里徒步", platformName: "示例论坛", subtitle: "主持人", status: .playing),
            onTap: {}, onPlayPause: {}, onNext: {}
        )
        PRMiniPlayer(
            nowPlaying: .init(
                title: "合成标题",
                platformName: "示例论坛",
                subtitle: "网友",
                status: .paused,
                isLocalSpeech: true
            ),
            onTap: {}, onPlayPause: {}, onNext: {}
        )
    }
    .padding()
    .background(PRColor.bgPrimary)
}
