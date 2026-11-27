import SwiftUI

/// 登录流程的占位页（P4-IOS-05 替换为介绍页、欢迎页与登录）。
public struct OnboardingPlaceholder: View {
    public init() {}

    public var body: some View {
        Text("PostReader", comment: "占位页标题；正式页面在 P4-IOS-05 实现")
            .accessibilityIdentifier("onboarding.placeholder")
    }
}
