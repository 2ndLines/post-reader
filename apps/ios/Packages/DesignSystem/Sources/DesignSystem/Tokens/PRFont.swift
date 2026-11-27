import SwiftUI

/// 字体（01 §5.1）：全部基于 Dynamic Type 文本样式，随系统字号缩放。
/// 原型 DESIGN.md 的字号与 iOS 文本样式的对应：28/34 → title、22/28 → title2、20/25 → title3、17/22 → headline、
/// 16/21 → callout、15/20 → subheadline、13/18 → footnote、12/16 → caption、11/13 → caption2。
/// 原型「正文 14/20」没有对应的文本样式，取最接近的 subheadline 15/20（P4-IOS-02 Q1）。
public enum PRFont {
    /// 营销大标题（订阅页主标语、登录页标题）
    public static let largeTitle = Font.system(.title, weight: .bold)
    /// 首页标签
    public static let title = Font.system(.title2, weight: .bold)
    /// 强调标题
    public static let title3 = Font.system(.title3, weight: .semibold)
    /// 栏标题、卡片标题
    public static let headline = Font.system(.headline, weight: .semibold)
    /// 正文、行内值
    public static let body = Font.system(.subheadline)
    /// 输入框、主按钮
    public static let callout = Font.system(.callout)
    /// 列表行
    public static let subheadline = Font.system(.subheadline, weight: .medium)
    /// 次要文字、分组标题
    public static let footnote = Font.system(.footnote)
    /// 说明
    public static let caption = Font.system(.caption)
    /// 角标
    public static let caption2 = Font.system(.caption2, weight: .semibold)
    /// 验证码、调试信息
    public static let mono = Font.system(.title2, design: .monospaced, weight: .semibold)
}
