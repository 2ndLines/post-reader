import SwiftUI

/// 帖子卡片的显示数据。**不含任何计数**（点赞、收藏、浏览、热度、排名；PRD 7.3、根 AGENTS.md）。
public struct PostCardModel: Identifiable, Sendable {
    public enum Media: Sendable {
        case image(Image, extraCount: Int)
        case video(Image, durationSec: Int)
    }

    public enum State: Sendable { case `default`, playing, capturing, needsSiteLogin, failed }

    public let id: String
    public let title: String
    public let summary: String
    public let platformName: String
    public let media: Media?
    public let isSample: Bool
    public let state: State

    public init(
        id: String,
        title: String,
        summary: String,
        platformName: String,
        media: Media? = nil,
        isSample: Bool = false,
        state: State = .default
    ) {
        self.id = id
        self.title = title
        self.summary = summary
        self.platformName = platformName
        self.media = media
        self.isSample = isSample
        self.state = state
    }
}

/// 全应用唯一的帖子卡片（01 §5.2；原型 post-card.tsx）：标题两行、摘要三行、右侧缩略图、底部平台名与「更多」。
public struct PRPostCard: View {
    public enum Context: Sendable { case home, favorites, playlist, search }

    private let post: PostCardModel
    private let context: Context
    private let onSelect: () -> Void
    private let onMore: (() -> Void)?

    public init(
        post: PostCardModel,
        context: Context,
        onSelect: @escaping () -> Void,
        onMore: (() -> Void)? = nil
    ) {
        self.post = post
        self.context = context
        self.onSelect = onSelect
        self.onMore = onMore
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: PRSpace.s) {
                    Text(post.title)
                        .font(PRFont.headline)
                        .foregroundStyle(PRColor.textPrimary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.trailing, post.isSample ? PRSpace.xxl : 0)
                    HStack(alignment: .top, spacing: PRSpace.m) {
                        Text(post.summary)
                            .font(PRFont.body)
                            .foregroundStyle(PRColor.textSecondary)
                            .lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let media = post.media {
                            MediaThumbnail(media: media)
                        }
                    }
                }
                .multilineTextAlignment(.leading)
                .padding(.horizontal, PRSpace.l)
                .padding(.top, PRSpace.m + 2)
                .padding(.bottom, PRSpace.xs)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            footer
        }
        .background(PRColor.bgElevated, in: RoundedRectangle(cornerRadius: PRRadius.l))
        .overlay(alignment: .topTrailing) {
            if post.isSample {
                SampleRibbon()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: PRRadius.l))
    }

    private var footer: some View {
        HStack(spacing: PRSpace.s) {
            Text(post.platformName)
                .font(PRFont.caption.weight(.medium))
                .foregroundStyle(PRColor.textSecondary)
                .lineLimit(1)
            statusLabel
            Spacer(minLength: 0)
            if let onMore {
                Button(action: onMore) {
                    Image(systemName: PRIcon.more)
                        .font(PRFont.headline)
                        .foregroundStyle(PRColor.textSecondary)
                        .frame(width: PRSize.minTapTarget, height: PRSize.minTapTarget)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("更多操作"))
            }
        }
        .padding(.leading, PRSpace.l)
        .padding(.trailing, PRSpace.xs + 2)
        .frame(minHeight: PRSize.minTapTarget)
    }

    @ViewBuilder private var statusLabel: some View {
        switch post.state {
        case .default:
            EmptyView()
        case .playing:
            Label("正在播放", systemImage: "waveform")
                .font(PRFont.caption.weight(.medium))
                .foregroundStyle(PRColor.accent)
        case .capturing:
            HStack(spacing: PRSpace.xs) {
                ProgressView().controlSize(.mini)
                Text("正在获取").font(PRFont.caption.weight(.medium))
            }
            .foregroundStyle(PRColor.textSecondary)
        case .needsSiteLogin:
            Label("需要登录", systemImage: PRIcon.lock)
                .font(PRFont.caption.weight(.medium))
                .foregroundStyle(PRColor.accent)
        case .failed:
            Label("获取失败", systemImage: "exclamationmark.circle")
                .font(PRFont.caption.weight(.medium))
                .foregroundStyle(PRColor.danger)
        }
    }
}

/// 缩略图 80×60、圆角 12；视频显示时长，多图显示 +N（原型 PostMedia）
struct MediaThumbnail: View {
    let media: PostCardModel.Media

    var body: some View {
        ZStack {
            image.resizable().scaledToFill()
        }
        .frame(width: 80, height: 60)
        .background(PRColor.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: PRRadius.s))
        .overlay(alignment: .bottomTrailing) { badge.padding(PRSpace.xs) }
        .overlay {
            if case .video = media {
                Image(systemName: PRIcon.play)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(.black.opacity(0.45), in: Circle())
                    .accessibilityHidden(true)
            }
        }
    }

    private var image: Image {
        switch media {
        case let .image(image, _), let .video(image, _): image
        }
    }

    @ViewBuilder private var badge: some View {
        switch media {
        case let .video(_, seconds):
            Text(String(format: "%d:%02d", seconds / 60, seconds % 60))
                .font(PRFont.caption2.monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, PRSpace.xs + 2)
                .background(.black.opacity(0.55), in: Capsule())
                .accessibilityLabel(Text("视频 \(seconds / 60) 分 \(seconds % 60) 秒"))
        case let .image(_, extra) where extra > 0:
            Text("+\(extra)")
                .font(PRFont.caption2)
                .foregroundStyle(PRColor.textPrimary)
                .padding(.horizontal, PRSpace.xs + 2)
                .background(.thinMaterial, in: Capsule())
                .accessibilityLabel(Text("还有 \(extra) 张图片"))
        case .image:
            EmptyView()
        }
    }
}

/// 右上角斜角标「样帖试听」（原型 sample-ribbon）
struct SampleRibbon: View {
    var body: some View {
        Text("样帖试听")
            .font(PRFont.caption2)
            .foregroundStyle(PRColor.textInverse)
            .frame(width: 124)
            .padding(.vertical, 2)
            .background(PRColor.accent)
            .rotationEffect(.degrees(45))
            .offset(x: 34, y: 14)
            .accessibilityLabel(Text("样帖试听"))
    }
}

#Preview("PRPostCard") {
    ScrollView {
        VStack(spacing: PRSpace.m) {
            PRPostCard(
                post: PostCardModel(
                    id: "1", title: "合成标题：周末去哪里徒步", summary: "合成摘要：几条路线的难度与沿途风景对比。",
                    platformName: "示例论坛", isSample: true
                ),
                context: .home, onSelect: {}, onMore: {}
            )
            PRPostCard(
                post: PostCardModel(
                    id: "2", title: "需要站点登录的帖子", summary: "合成摘要。", platformName: "示例社区",
                    state: .needsSiteLogin
                ),
                context: .favorites, onSelect: {}, onMore: {}
            )
        }
        .padding()
    }
    .background(PRColor.bgPrimary)
}
