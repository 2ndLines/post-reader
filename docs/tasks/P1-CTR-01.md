# P1-CTR-01 `packages/contracts`：基础枚举、`CanonicalPost`、错误码、problem+json

## 目标
建立端云契约的唯一来源（00 §3.1）的第一部分：基础枚举、`CanonicalPost` / `Unit`、`ErrorCode` 与 RFC 9457 problem+json，用 zod 定义，供后端、管理后台、测试台架共用。

## 依据
- 架构：00 §3.1（目录、基础枚举）、§4.2–§4.4（ID、时间与语言、错误）；《完整技术架构》§4.3（`CanonicalPost` 数据模型）；02 §12（错误处理）
- 依赖：05 §4.1（`zod`，P1，已定）

## 交付物
- `packages/contracts/src/common.ts`、`canonical-post.ts`、`errors.ts`、`index.ts`；测试 `contracts.test.ts`

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 13 个基础枚举的取值与 00 §3.1 表格逐项一致，由测试直接解析文档表格比对 —— 测试输出
2. `CanonicalPost` 的跨字段规则（主帖位置、unitId 唯一、parentId 引用、hash 格式、UTC 时间）各有拒绝用例 —— 测试输出
3. 合法样例的 `cleanText` 与 `hash` 由 `canonical-spec` 生成并通过校验 —— 测试输出
4. `zod` 固定精确版本，且版本发布已满 3 天 —— `package.json`、锁文件
5. `pnpm verify`、`knip`、CI 全绿

## 范围外
API 路由的契约与 OpenAPI 生成（P1-CTR-02）；WebSocket 消息（P1-CTR-03）；`config-schema`（P1-CTR-04）；服务端重算摘要（P3-SRV-01）。

## 上下文摘要（助手填写）

填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p1-ios-01` 上。

- **基础枚举**：取值以 00 §3.1 的表格为准。
- **`CanonicalPost` 的定义来源**：只在《完整技术架构》§4.3（在线文档的导出副本）中有完整定义，这里以它为依据。其中 `Unit` 上报的是 `cleanText` 与 `hash`。
- **错误响应**：00 §4.4 规定使用 problem+json，含 `code` 与 `traceId`；`DAILY_LIMIT` 必须带 `resetAt`（00 §3.1）。

## 计划（助手填写）

- 枚举与类型用 `z.enum` 定义，同时导出 TS 类型。
- `CanonicalPost` 的跨字段规则用 `superRefine` 一次性检查。对象采用 zod 默认的 strip 模式：未知字段被丢弃而不是报错，以兼容「只增可选字段」的规则。
- 测试中的枚举期望值从 00 §3.1 的表格直接解析，不在测试中重复抄写；`CanonicalPost` 的合法样例用 `canonical-spec` 生成 `cleanText` 与 `hash`。

## 风险与问题（助手填写）

- **P1-SPEC-01 的 Q7 已由契约解决**：客户端上报的是 `cleanText`，服务端直接对 `cleanText` 计算摘要，不再清洗一次。已写入 `canonical-post.ts` 的注释与 SPEC.md。
- **Q1 `VALIDATION_FAILED` 的 HTTP 状态码前后矛盾**：02 §12 写 400，§23.3（年龄确认）写 422。
  - 契约不定义 code 到 status 的映射（00 §4.4：客户端只按 `code` 处理）。
  - 默认：P2 实现时统一用 400，并修改 §23.3。待负责人确认。
- **Q2 `CanonicalPost` 的定义只在在线文档的导出副本中**：00 已声明在线文档不再作为主版本维护。
  - 默认：以本包为唯一来源。
  - 建议：在 00 §3.1 或 02 中补上指向本包的说明。

## 交接记录（会话结束时填写）

**2026-11-26 · AC1–AC5 已完成**

- **AC1**：13 个枚举的取值与 00 §3.1 表格一致。测试直接解析 Markdown 表格，忽略全角括号内的说明文字后比对。
- **AC2**：13 种非法的 `CanonicalPost` 都被拒绝，并且错误落在预期的字段路径上；空 `units`、非法 BCP 47 标签、problem+json 的各类非法输入也都被拒绝。
- **AC3**：合法样例的 `cleanText` 由 `clean('主帖&amp;正文\r\n')` 生成，结果为 `主帖&正文`；`hash` 由 `unitHash` 生成，样例通过校验。
- **AC4**：zod 4.6.7（发布于 2026-10-12）。
- **AC5**：`vitest` 44 条全部通过；`typecheck`、Biome、knip 都通过。
- **测试写法**：最初用 `(p: any) =>` 修改样本，被 Biome 的 `noExplicitAny` 拦下，已改为「路径 + 新值」的数据表加 `setPath` 辅助函数。
- **下一步**：P1-CTR-02（API 契约与 `openapi.yaml` 生成；同时完成 V3，即 zod-to-openapi 与 swift-openapi-generator 的兼容性验证；在 `contracts` 工作流中加入 Swift 侧的 `swift test`）。
