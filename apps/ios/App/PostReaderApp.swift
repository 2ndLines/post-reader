import FeatureOnboarding
import SwiftUI

/// 应用入口（01 §2）。依赖组装（AppEnvironment）、路由与生命周期在后续任务卡加入。
@main
struct PostReaderApp: App {
    var body: some Scene {
        WindowGroup {
            OnboardingPlaceholder()
        }
    }
}
