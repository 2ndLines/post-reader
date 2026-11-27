import SwiftUI

/// 文本输入（01 §5.2）：邮箱或普通文本。圆角 16（原型「内嵌块」），错误提示在控件正下方（原型 DESIGN.md「颜色」）。
public struct PRTextField: View {
    public enum Kind: Sendable { case email, plain }

    private let title: LocalizedStringKey
    @Binding private var text: String
    private let kind: Kind
    private let error: LocalizedStringKey?
    @FocusState private var focused: Bool

    public init(
        _ title: LocalizedStringKey,
        text: Binding<String>,
        kind: Kind = .plain,
        error: LocalizedStringKey? = nil
    ) {
        self.title = title
        _text = text
        self.kind = kind
        self.error = error
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PRSpace.xs) {
            TextField(title, text: $text)
                .font(PRFont.callout)
                .foregroundStyle(PRColor.textPrimary)
                .textContentType(kind == .email ? .emailAddress : nil)
                .keyboardType(kind == .email ? .emailAddress : .default)
                .textInputAutocapitalization(kind == .email ? .never : .sentences)
                .autocorrectionDisabled(kind == .email)
                .focused($focused)
                .padding(.horizontal, PRSpace.l)
                .frame(minHeight: PRSize.minTapTarget + PRSpace.s)
                .background(PRColor.bgElevated, in: RoundedRectangle(cornerRadius: PRRadius.m))
                .overlay(
                    RoundedRectangle(cornerRadius: PRRadius.m)
                        .strokeBorder(borderColor, lineWidth: focused || error != nil ? 2 : 1)
                )
            if let error {
                Text(error)
                    .font(PRFont.footnote)
                    .foregroundStyle(PRColor.danger)
                    .accessibilityLabel(Text("错误：") + Text(error))
            }
        }
    }

    private var borderColor: Color {
        if error != nil {
            return PRColor.danger
        }
        return focused ? PRColor.accent : PRColor.separator
    }
}

#Preview("PRTextField") {
    @Previewable @State var email = ""
    @Previewable @State var wrong = "not-an-email"
    VStack(spacing: PRSpace.l) {
        PRTextField("邮箱", text: $email, kind: .email)
        PRTextField("邮箱", text: $wrong, kind: .email, error: "邮箱格式不正确")
    }
    .padding()
    .background(PRColor.bgPrimary)
}
