@testable import APIClient
import Foundation
import OpenAPIRuntime
import Testing

/// 证明 openapi.yaml 能被 swift-openapi-generator 消费、生成代码能编译，并且关键类型可用（05 §1.2 V3、P1 出口条件）。
@Suite("生成的 API 客户端")
struct GeneratedClientTests {
    @Test("关键操作都已生成")
    func operationsExist() {
        // 引用生成的操作类型：任一缺失都会导致编译失败
        _ = Operations.CreateJob.id
        _ = Operations.GetMe.id
        _ = Operations.GetConfigBundle.id
        _ = Operations.SyncSubscription.id
        #expect(Operations.CreateJob.id == "createJob")
    }

    @Test("ProblemDetails 能按契约解码，未知 code 解码失败")
    func problemDetailsDecoding() throws {
        let json = Data(
            (#"{"type":"about:blank","title":"x","status":429,"code":"DAILY_LIMIT","#
                + #""traceId":"t","resetAt":"2026-11-27T00:00:00Z"}"#).utf8
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let problem = try decoder.decode(Components.Schemas.ProblemDetails.self, from: json)
        #expect(problem.code == .dailyLimit)
        #expect(problem.status == 429)
        let unknown = Data(#"{"title":"x","status":500,"code":"TEAPOT","traceId":"t"}"#.utf8)
        #expect(throws: (any Error).self) { try decoder.decode(Components.Schemas.ProblemDetails.self, from: unknown) }
    }
}
