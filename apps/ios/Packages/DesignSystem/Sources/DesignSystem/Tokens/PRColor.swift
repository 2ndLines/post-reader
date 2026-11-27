import SwiftUI
import UIKit

/// 语义色（01 §5.1）。取值来自冻结原型 globals.css 的主题变量（浅色 / 深色各一套）；页面只能用这里的 token。
/// 原型没有的项使用系统语义色（PRD「系统组件优先」）：textTertiary 用 tertiaryLabel，speakerPalette 用系统色（P4-IOS-02 Q2）。
public enum PRColor {
    /// --background
    public static let bgPrimary = dynamic(light: 0xF2F2F7, dark: 0x0B0B0E)
    /// --secondary
    public static let bgSecondary = dynamic(light: 0xE5E5EA, dark: 0x26262A)
    /// --card
    public static let bgElevated = dynamic(light: 0xFFFFFF, dark: 0x1C1C1F)
    /// --foreground
    public static let textPrimary = dynamic(light: 0x141517, dark: 0xF5F5F7)
    /// --muted-foreground
    public static let textSecondary = dynamic(light: 0x666A71, dark: 0x9EA4B2)
    public static let textTertiary = Color(uiColor: .tertiaryLabel)
    /// --primary-foreground
    public static let textInverse = Color.white
    /// --primary
    public static let accent = dynamic(light: 0x007AFF, dark: 0x0A84FF)
    /// --accent（深色为 rgba(10,132,255,0.18)）
    public static let accentMuted = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 10 / 255, green: 132 / 255, blue: 1, alpha: 0.18)
            : rgb(0xE5F1FF)
    })
    /// --accent-foreground
    public static let accentOnMuted = dynamic(light: 0x007AFF, dark: 0x409CFF)
    /// --border
    public static let separator = dynamic(light: 0xDCDCE2, dark: 0x2C2C32)
    /// --muted
    public static let fill = dynamic(light: 0xE5E5EA, dark: 0x26262A)
    /// --switch-on
    public static let success = dynamic(light: 0x34C759, dark: 0x30D158)
    /// --status-warning-fg
    public static let warning = dynamic(light: 0x854D0E, dark: 0xFCD34D)
    /// --destructive
    public static let danger = dynamic(light: 0xD70015, dark: 0xFF453A)
    /// 播放页发言人色带，长度 = 音色槽位上限（P4-IOS-02 Q2：原型未给出，暂用系统色）
    public static let speakerPalette: [Color] = [
        .init(uiColor: .systemBlue), .init(uiColor: .systemOrange), .init(uiColor: .systemGreen),
        .init(uiColor: .systemPink), .init(uiColor: .systemPurple), .init(uiColor: .systemTeal),
        .init(uiColor: .systemIndigo), .init(uiColor: .systemBrown),
    ]

    static func rgb(_ hex: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }

    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? rgb(dark) : rgb(light) })
    }
}
