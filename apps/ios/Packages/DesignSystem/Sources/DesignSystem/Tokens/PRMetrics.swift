import Foundation

/// 间距（01 §5.1）
public enum PRSpace {
    public static let xxs: CGFloat = 2
    public static let xs: CGFloat = 4
    public static let s: CGFloat = 8
    public static let m: CGFloat = 12
    public static let l: CGFloat = 16
    public static let xl: CGFloat = 24
    public static let xxl: CGFloat = 32
}

/// 圆角：取冻结原型 DESIGN.md 的层级（小块 12、内嵌块 16、卡片 24、弹层 34），与 01 §5.1 的示例数值不同，以原型为准（01 §23.1「视觉取值以冻结原型为准」）
public enum PRRadius {
    public static let s: CGFloat = 12
    public static let m: CGFloat = 16
    public static let l: CGFloat = 24
    public static let sheet: CGFloat = 34
}

/// 动效时长（秒，01 §5.1）；系统开启「减弱动态效果」时由组件改为无动画
public enum PRMotion {
    public static let quick = 0.15
    public static let standard = 0.25
    public static let emphasized = 0.35
}

/// 尺寸约束
public enum PRSize {
    /// 最小点击区域（HIG；原型按钮 min-h 44）
    public static let minTapTarget: CGFloat = 44
    /// 大按钮高度（原型 size lg：50）
    public static let largeButtonHeight: CGFloat = 50
}

/// SF Symbols 名称常量，避免散落字符串
public enum PRIcon {
    public static let close = "xmark"
    public static let back = "chevron.left"
    public static let play = "play.fill"
    public static let pause = "pause.fill"
    public static let search = "magnifyingglass"
    public static let bell = "bell"
    public static let more = "ellipsis"
    public static let envelope = "envelope"
    public static let lock = "lock.fill"
}
