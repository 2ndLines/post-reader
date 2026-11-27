@testable import DesignSystem
import SnapshotTesting
import SwiftUI
import Testing
import UIKit

/// 快照：每个组件的全部状态 × 深浅色 × 3 档字体（xSmall、large、accessibility3，01 §5.3）。
/// 参考图在 iOS 27.2 模拟器上录制；iOS 18 的一套待模拟器运行时就绪（P4-IOS-02 Q3）。
/// 重新录制：TEST_RUNNER_SNAPSHOT_TESTING_RECORD=all make -C apps/ios test（xcodebuild 只把 TEST_RUNNER_ 前缀的变量传给模拟器）
@MainActor
@Suite("快照", .serialized)
struct SnapshotTests {
    struct Variant {
        let name: String
        let scheme: ColorScheme
        let size: DynamicTypeSize

        init(_ name: String, _ scheme: ColorScheme, _ size: DynamicTypeSize) {
            self.name = name
            self.scheme = scheme
            self.size = size
        }
    }

    static let variants: [Variant] = [
        Variant("light-xSmall", .light, .xSmall),
        Variant("light-large", .light, .large),
        Variant("light-ax3", .light, .accessibility3),
        Variant("dark-xSmall", .dark, .xSmall),
        Variant("dark-large", .dark, .large),
        Variant("dark-ax3", .dark, .accessibility3),
    ]

    private func snapshot(
        _ view: some View,
        testName: String = #function,
        fileID: StaticString = #fileID,
        file: StaticString = #filePath,
        line: UInt = #line,
        column: UInt = #column
    ) {
        for variant in Self.variants {
            let traits = UITraitCollection { mutable in
                mutable.userInterfaceStyle = variant.scheme == .dark ? .dark : .light
                mutable.preferredContentSizeCategory = UIContentSizeCategory(variant.size)
            }
            let framed = view
                .padding(PRSpace.l)
                .frame(width: 390)
                .background(PRColor.bgPrimary)
                .environment(\.colorScheme, variant.scheme)
                .environment(\.dynamicTypeSize, variant.size)
            assertSnapshot(
                of: framed,
                as: .image(perceptualPrecision: 0.98, layout: .sizeThatFits, traits: traits),
                named: variant.name,
                fileID: fileID, file: file, testName: testName, line: line, column: column
            )
        }
    }

    @Test func prButton() {
        snapshot(VStack(spacing: PRSpace.m) {
            PRButton("继续", role: .primary) {}
            PRButton("使用邮箱登录", icon: PRIcon.envelope, role: .secondary) {}
            PRButton("稍后再说", role: .tertiary) {}
            PRButton("注销账号", role: .destructive) {}
            PRButton("继续", size: .large) {}
            PRButton("提交中", isLoading: true) {}
            PRButton("不可用") {}.disabled(true)
        })
    }

    @Test func prIconButton() {
        snapshot(HStack(spacing: PRSpace.m) {
            PRIconButton(PRIcon.search, accessibilityLabel: "搜索") {}
            PRIconButton(PRIcon.bell, accessibilityLabel: "通知") {}
            PRIconButton(PRIcon.close, accessibilityLabel: "关闭") {}.disabled(true)
        })
    }

    @Test func prCountdownButton() {
        // 按阶段渲染，与当前时间无关（避免跨秒导致的快照抖动）
        snapshot(VStack(spacing: PRSpace.m) {
            CountdownPhaseButton(phase: .idle) {}
            CountdownPhaseButton(phase: .counting(remaining: 90)) {}
            CountdownPhaseButton(phase: .resend) {}
        })
    }

    @Test func prTextField() {
        snapshot(VStack(spacing: PRSpace.l) {
            PRTextField("邮箱", text: .constant(""), kind: .email)
            PRTextField("邮箱", text: .constant("someone@example.com"), kind: .email)
            PRTextField("邮箱", text: .constant("not-an-email"), kind: .email, error: "邮箱格式不正确")
        })
    }

    @Test func prCodeField() {
        snapshot(VStack(spacing: PRSpace.l) {
            PRCodeField(code: .constant("")) { _ in }
            PRCodeField(code: .constant("123")) { _ in }
            PRCodeField(code: .constant("123456")) { _ in }
            PRCodeField(code: .constant("000000"), isError: true) { _ in }
        })
    }

    private static func swatch(_ color: UIColor) -> Image {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 80, height: 60)).image { ctx in
            color.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 80, height: 60))
        }
        return Image(uiImage: image)
    }

    @Test func prSegmentedTabs() {
        snapshot(PRSegmentedTabs(
            selection: .constant(0),
            items: [.init(id: 0, title: "推荐"), .init(id: 1, title: "收藏")]
        ))
    }

    @Test func prSpeakerChip() {
        snapshot(HStack {
            PRSpeakerChip(role: .host, slot: 0)
            PRSpeakerChip(role: .op, slot: 1)
            PRSpeakerChip(role: .commenter, slot: 9, displayName: "路人甲")
        })
    }

    @Test func prPostCard() {
        let summary = "合成摘要：几条路线的难度、补给点与沿途风景对比，适合周末一日往返。"
        snapshot(VStack(spacing: PRSpace.m) {
            PRPostCard(
                post: PostCardModel(
                    id: "1",
                    title: "合成标题：周末去哪里徒步",
                    summary: summary,
                    platformName: "示例论坛",
                    media: .image(Self.swatch(.systemTeal), extraCount: 2),
                    isSample: true
                ),
                context: .home, onSelect: {}, onMore: {}
            )
            PRPostCard(
                post: PostCardModel(
                    id: "2",
                    title: "正在播放的帖子",
                    summary: summary,
                    platformName: "示例社区",
                    media: .video(Self.swatch(.systemIndigo), durationSec: 83),
                    state: .playing
                ),
                context: .home, onSelect: {}, onMore: {}
            )
            PRPostCard(
                post: PostCardModel(
                    id: "3",
                    title: "需要站点登录",
                    summary: summary,
                    platformName: "示例社区",
                    state: .needsSiteLogin
                ),
                context: .favorites, onSelect: {}, onMore: {}
            )
            PRPostCard(
                post: PostCardModel(id: "4", title: "获取失败", summary: summary, platformName: "示例论坛", state: .failed),
                context: .search, onSelect: {}
            )
        })
    }

    @Test func prMiniPlayer() {
        snapshot(VStack(spacing: PRSpace.l) {
            PRMiniPlayer(
                nowPlaying: .init(title: "合成标题：周末去哪里徒步", platformName: "示例论坛", subtitle: "主持人", status: .playing),
                onTap: {},
                onPlayPause: {},
                onNext: {}
            )
            PRMiniPlayer(
                nowPlaying: .init(
                    title: "合成标题",
                    platformName: "forum",
                    subtitle: "网友",
                    status: .paused,
                    isLocalSpeech: true,
                    hasNext: false
                ),
                onTap: {},
                onPlayPause: {},
                onNext: {}
            )
            PRMiniPlayer(
                nowPlaying: .init(title: "合成标题", platformName: "示例", subtitle: "", status: .buffering),
                onTap: {},
                onPlayPause: {},
                onNext: {}
            )
        })
    }

    @Test func prProgressScrubber() {
        snapshot(PRProgressScrubber(
            chapters: [
                .init(id: "a", durationMs: 30000),
                .init(id: "b", durationMs: 60000),
                .init(id: "c", durationMs: 45000),
            ],
            positionMs: 50000
        ) { _ in })
    }

    @Test func prPlayerControls() {
        snapshot(VStack(spacing: PRSpace.l) {
            PRPlayerControls(
                state: .playing,
                canPrevPost: false,
                onPrevPost: {},
                onPrevChapter: {},
                onPlayPause: {},
                onNextChapter: {},
                onNextPost: {}
            )
            PRPlayerControls(
                state: .paused,
                canPrevPost: true,
                rate: 1.5,
                onPrevPost: {},
                onPrevChapter: {},
                onPlayPause: {},
                onNextChapter: {},
                onNextPost: {}
            )
        })
    }
}
