import Testing
@testable import TestSupport

@Test func moduleIsLinked() {
    #expect(TestSupportModule.name == "TestSupport")
}
