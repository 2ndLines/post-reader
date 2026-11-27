import XCTest

/// 冒烟：App 能在模拟器上启动并显示首屏（P4-IOS-01）。XCUITest 目前只支持 XCTest。
final class LaunchTests: XCTestCase {
    @MainActor
    func testLaunchShowsFirstScreen() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["onboarding.placeholder"].waitForExistence(timeout: 10))
    }
}
