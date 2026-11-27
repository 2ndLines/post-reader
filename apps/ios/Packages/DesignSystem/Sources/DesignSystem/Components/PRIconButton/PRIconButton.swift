import SwiftUI

/// 图标按钮（01 §5.2）：圆形，44×44；accessibilityLabel 必填（01 §5.3）。
public struct PRIconButton: View {
    private let icon: String
    private let label: LocalizedStringKey
    private let action: () -> Void

    public init(_ icon: String, accessibilityLabel label: LocalizedStringKey, action: @escaping () -> Void) {
        self.icon = icon
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(PRFont.headline)
                .frame(width: PRSize.minTapTarget, height: PRSize.minTapTarget)
        }
        .buttonStyle(PRButtonStyle(background: PRColor.bgElevated, foreground: PRColor.textPrimary))
        .accessibilityLabel(label)
    }
}

#Preview("PRIconButton") {
    HStack(spacing: PRSpace.m) {
        PRIconButton(PRIcon.search, accessibilityLabel: "搜索") {}
        PRIconButton(PRIcon.bell, accessibilityLabel: "通知") {}
        PRIconButton(PRIcon.more, accessibilityLabel: "更多") {}
        PRIconButton(PRIcon.close, accessibilityLabel: "关闭") {}.disabled(true)
    }
    .padding()
    .background(PRColor.bgPrimary)
}
