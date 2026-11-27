import SwiftUI

/// 当前发言人（01 §5.2）：颜色取 speakerPalette[slot]（槽位超出色带长度时循环取色）。
public struct PRSpeakerChip: View {
    public enum Role: Sendable { case host, op, commenter }

    private let role: Role
    private let slot: Int
    private let displayName: String?

    public init(role: Role, slot: Int, displayName: String? = nil) {
        self.role = role
        self.slot = slot
        self.displayName = displayName
    }

    public var body: some View {
        HStack(spacing: PRSpace.xs) {
            Circle()
                .fill(PRColor.speakerPalette[slot % PRColor.speakerPalette.count])
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            Text(label)
                .font(PRFont.footnote.weight(.semibold))
                .foregroundStyle(PRColor.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, PRSpace.m)
        .padding(.vertical, PRSpace.xs)
        .background(PRColor.bgSecondary, in: Capsule())
        .accessibilityElement(children: .combine)
    }

    private var label: String {
        switch role {
        case .host: String(localized: "主持人")
        case .op: displayName ?? String(localized: "楼主")
        case .commenter: displayName ?? String(localized: "网友")
        }
    }
}

#Preview("PRSpeakerChip") {
    HStack {
        PRSpeakerChip(role: .host, slot: 0)
        PRSpeakerChip(role: .op, slot: 1)
        PRSpeakerChip(role: .commenter, slot: 2, displayName: "路人甲")
    }
    .padding()
    .background(PRColor.bgPrimary)
}
