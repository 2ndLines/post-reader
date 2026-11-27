import SwiftUI

/// 进度条（01 §5.2）：按章节分段，段间留缝；拖动或点按跳到某位置。可访问性上作为可调节元素，上下滑动按章节跳转。
public struct PRProgressScrubber: View {
    public struct Chapter: Identifiable, Sendable {
        public let id: String
        public let durationMs: Int

        public init(id: String, durationMs: Int) {
            self.id = id
            self.durationMs = durationMs
        }
    }

    private let chapters: [Chapter]
    private let positionMs: Int
    private let onSeek: (Int) -> Void

    public init(chapters: [Chapter], positionMs: Int, onSeek: @escaping (Int) -> Void) {
        self.chapters = chapters
        self.positionMs = positionMs
        self.onSeek = onSeek
    }

    private var totalMs: Int {
        max(1, chapters.reduce(0) { $0 + $1.durationMs })
    }

    public var body: some View {
        GeometryReader { geo in
            let gap: CGFloat = 3
            let usable = max(0, geo.size.width - gap * CGFloat(max(0, chapters.count - 1)))
            HStack(spacing: gap) {
                ForEach(Array(chapters.enumerated()), id: \.element.id) { index, chapter in
                    let start = chapters.prefix(index).reduce(0) { $0 + $1.durationMs }
                    let filled = min(max(Double(positionMs - start) / Double(max(1, chapter.durationMs)), 0), 1)
                    let width = usable * CGFloat(chapter.durationMs) / CGFloat(totalMs)
                    ZStack(alignment: .leading) {
                        Capsule().fill(PRColor.fill)
                        Capsule().fill(PRColor.accent).frame(width: width * filled)
                    }
                    .frame(width: width, height: 6)
                }
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onEnded { value in
                let ratio = min(max(value.location.x / max(1, geo.size.width), 0), 1)
                onSeek(Int(Double(totalMs) * ratio))
            })
        }
        .frame(height: PRSize.minTapTarget)
        .accessibilityElement()
        .accessibilityLabel(Text("播放进度"))
        .accessibilityValue(Text("第 \(currentChapterIndex + 1) 章，共 \(chapters.count) 章"))
        .accessibilityAdjustableAction { direction in
            let target = direction == .increment ? currentChapterIndex + 1 : currentChapterIndex - 1
            guard chapters.indices.contains(target) else { return }
            onSeek(chapters.prefix(target).reduce(0) { $0 + $1.durationMs })
        }
    }

    /// 当前位置所在的章节下标（超出总长时取最后一章）
    var currentChapterIndex: Int {
        var start = 0
        for (index, chapter) in chapters.enumerated() {
            if positionMs < start + chapter.durationMs {
                return index
            }
            start += chapter.durationMs
        }
        return max(0, chapters.count - 1)
    }
}

#Preview("PRProgressScrubber") {
    PRProgressScrubber(
        chapters: [
            .init(id: "a", durationMs: 30000),
            .init(id: "b", durationMs: 60000),
            .init(id: "c", durationMs: 45000),
        ],
        positionMs: 50000
    ) { _ in }
        .padding()
        .background(PRColor.bgPrimary)
}
