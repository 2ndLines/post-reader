import SwiftUI

/// 验证码的输入规则：只保留数字，最多 length 位。纯函数，便于测试。
public enum CodeInput {
    public static func sanitize(_ raw: String, length: Int) -> String {
        String(raw.filter(\.isASCII).filter(\.isNumber).prefix(length))
    }
}

/// 6 位验证码输入（01 §5.2）：一个隐藏的文本框承接输入（支持系统的验证码自动填充 `.oneTimeCode`），上面画出 length 个格子。
/// 状态：empty / partial / complete / error；输满时调用 onComplete。
public struct PRCodeField: View {
    @Binding private var code: String
    private let length: Int
    private let isError: Bool
    private let onComplete: (String) -> Void
    @FocusState private var focused: Bool

    public init(code: Binding<String>, length: Int = 6, isError: Bool = false, onComplete: @escaping (String) -> Void) {
        _code = code
        self.length = length
        self.isError = isError
        self.onComplete = onComplete
    }

    public var body: some View {
        ZStack {
            TextField("", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .focused($focused)
                // 输入框只承接输入与自动填充（缩到 1 pt 且近乎透明，不画出文字与光标），内容由格子显示
                .frame(width: 1, height: 1)
                .opacity(0.001)
                .accessibilityLabel(Text("验证码"))
                .accessibilityValue(Text(code))
                .onChange(of: code) { _, newValue in
                    let clean = CodeInput.sanitize(newValue, length: length)
                    if clean != newValue {
                        code = clean
                    }
                    if clean.count == length {
                        onComplete(clean)
                    }
                }
            HStack(spacing: PRSpace.s) {
                ForEach(0 ..< length, id: \.self) { index in
                    cell(index)
                }
            }
            .accessibilityHidden(true)
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
        }
    }

    private func cell(_ index: Int) -> some View {
        let chars = Array(code)
        let filled = index < chars.count
        return Text(filled ? String(chars[index]) : " ")
            .font(PRFont.mono)
            .foregroundStyle(PRColor.textPrimary)
            .frame(maxWidth: .infinity, minHeight: PRSize.largeButtonHeight)
            .background(PRColor.bgElevated, in: RoundedRectangle(cornerRadius: PRRadius.s))
            .overlay(
                RoundedRectangle(cornerRadius: PRRadius.s)
                    .strokeBorder(cellBorder(index: index, count: chars.count), lineWidth: 1.5)
            )
    }

    private func cellBorder(index: Int, count: Int) -> Color {
        if isError {
            return PRColor.danger
        }
        return focused && index == min(count, length - 1) ? PRColor.accent : PRColor.separator
    }
}

#Preview("PRCodeField") {
    @Previewable @State var partial = "123"
    @Previewable @State var wrong = "000000"
    VStack(spacing: PRSpace.l) {
        PRCodeField(code: $partial) { _ in }
        PRCodeField(code: $wrong, isError: true) { _ in }
    }
    .padding()
    .background(PRColor.bgPrimary)
}
