import SwiftUI

/// 通用按钮（01 §5.2）。原型 Button 变体：primary = default、secondary = secondary、tertiary = ghost、destructive = destructiveSolid。
/// 全圆角；最小高度 44（large 为 50）；按下缩放 0.97（「减弱动态效果」时不缩放）；禁用时不透明度 0.45。
public struct PRButton: View {
    public enum Role: Sendable { case primary, secondary, tertiary, destructive }
    public enum Size: Sendable { case regular, large }

    private let title: LocalizedStringKey
    private let icon: String?
    private let role: Role
    private let size: Size
    private let isLoading: Bool
    private let action: () -> Void

    public init(
        _ title: LocalizedStringKey,
        icon: String? = nil,
        role: Role = .primary,
        size: Size = .regular,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.role = role
        self.size = size
        self.isLoading = isLoading
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: PRSpace.s) {
                if isLoading {
                    ProgressView().tint(foreground)
                } else if let icon {
                    Image(systemName: icon).accessibilityHidden(true)
                }
                Text(title)
            }
            .font(size == .large ? PRFont.callout.weight(.semibold) : PRFont.body.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: size == .large ? PRSize.largeButtonHeight : PRSize.minTapTarget)
            .padding(.horizontal, size == .large ? PRSpace.xl : PRSpace.l)
        }
        .buttonStyle(PRButtonStyle(background: background, foreground: foreground))
        .disabled(isLoading)
        .accessibilityAddTraits(isLoading ? .updatesFrequently : [])
    }

    private var background: Color {
        switch role {
        case .primary: PRColor.accent
        case .secondary: PRColor.bgSecondary
        case .tertiary: .clear
        case .destructive: PRColor.danger
        }
    }

    private var foreground: Color {
        switch role {
        case .primary, .destructive: PRColor.textInverse
        case .secondary: PRColor.textPrimary
        case .tertiary: PRColor.accent
        }
    }
}

struct PRButtonStyle: ButtonStyle {
    let background: Color
    let foreground: Color
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground)
            .background(background, in: Capsule())
            .contentShape(Capsule())
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .opacity(isEnabled ? 1 : 0.45)
            .animation(reduceMotion ? nil : .easeOut(duration: PRMotion.quick), value: configuration.isPressed)
    }
}

#Preview("PRButton") {
    VStack(spacing: PRSpace.m) {
        PRButton("继续", role: .primary) {}
        PRButton("使用邮箱登录", icon: PRIcon.envelope, role: .secondary) {}
        PRButton("稍后再说", role: .tertiary) {}
        PRButton("注销账号", role: .destructive) {}
        PRButton("提交中", isLoading: true) {}
        PRButton("不可用") {}.disabled(true)
    }
    .padding()
    .background(PRColor.bgPrimary)
}
