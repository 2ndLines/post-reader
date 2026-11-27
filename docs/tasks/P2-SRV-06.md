# P2-SRV-06 请求签名中间件与重放测试

## 目标
按 02 §10.3 实现写请求的签名校验与防重放，并提供与 iOS 共用的黄金向量（由独立实现生成），完成 P2 出口条件中的「签名、重放」。

## 依据
- 架构：02 §4.1（第 5 步 `verifySignature`；保留 `rawBody`）、§10.3（签名算法、时间窗、nonce）；01 §8（iOS `SigningMiddleware`）
- 契约：OpenAPI 中的 `X-Ts`、`X-Nonce`、`X-Sig` 请求头（P1-CTR-02；Q2：`X-Ts` 为毫秒）

## 交付物
- `apps/server/src/platform/crypto/request-signature.ts`（受保护路径）；`src/modules/auth/signature-guard.ts`（受保护路径）；`buildApp` 保留原始请求体
- `packages/contracts/vectors/request-signature.json` 与 `scripts/request_signature_vectors.py`；根脚本 `pnpm check:sig-vectors`（已加入 `ci`）
- `POST /v1/auth/logout` 按契约挂载签名校验

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. TS 实现对独立 Python 实现生成的黄金向量逐条一致（规范化查询串、string_to_sign、签名） —— 单元测试
2. 签名覆盖方法、路径、查询串、时间戳、nonce 与请求体，任一被改动都返回 `SIGNATURE_INVALID`；错误的密钥、缺少签名头、超出 ±300 s 时间窗都被拒 —— 集成测试
3. 原样重放返回 `REPLAY_DETECTED`；并发重放只有一个通过；签名失败的请求不占用 nonce —— 集成测试
4. 规范化细节：按码点排序（而不是 UTF-16 码元）；RFC 3986 编码 `! ' ( ) *`；`+` 按字面处理 —— 单元测试与集成测试
5. `pnpm verify`、`knip`、`ci` 与 `integration` 工作流全绿

## 范围外
iOS 的 SigningMiddleware（P4-IOS-04，使用同一组向量）；其余写接口挂载签名（随各自的路由一起完成）；App Attest（P2-SRV-07）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p2-srv-05` 上。

- 02 §10.3 给出了 string_to_sign 与 HMAC 的计算方式，但没有定义 `CANONICAL_QUERY`。
- 签名算法本质上是 iOS 与服务端之间的契约，所以参照 canonical-spec 的做法：先写清楚规范化规则，再由独立的实现生成黄金向量。

## 计划（助手填写）
- Python 脚本生成 6 条向量（JSON 请求体、空请求体、多值查询的排序与编码、小写方法名、UTF-8 请求体、保留字符）。
- TS 实现中，排序按码点比较；查询串手工解析，不用 `URLSearchParams`；签名比较用常数时间。
- 先校验签名，再占用 nonce。
- 集成测试中注册一个只用于测试、需要认证与签名且没有副作用的路由，用来做真实的端到端重放。

## 风险与问题（助手填写）
- **Q1 `CANONICAL_QUERY` 的定义**：由本卡补全，已写入 02 §10.3。iOS 必须按同一规则实现，以同一组向量为准。待负责人确认。
- **Q2 时间窗失败的错误码**：超出时间窗返回 `SIGNATURE_INVALID`（detail 为 `timestamp`），不是 `REPLAY_DETECTED`。超出时间窗更多是客户端时钟偏差，而不是重放。待负责人确认。
- **R1 客户端时钟偏差**：时间窗为 ±300 s。客户端时钟偏差大时会持续失败，P4 的客户端需要用服务端返回的时间校准。
- **R2 每个签名请求都要读一次数据库**：取会话密钥需要读取 `sessions` 并解密，DEK 有缓存，会话密钥目前没有。P3 压测之后再决定是否缓存会话密钥。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC4 已完成；AC5 见 PR 的 CI**
- **AC1**：6 条 Python 黄金向量全部一致（单元测试 11 条，其中向量 6 条）。
- **AC2**：
  - 错误的密钥、缺少签名头、时间戳偏差 −301 s 或 +301 s 或不是数字，都返回 `SIGNATURE_INVALID`。
  - 签名时用的是 `{"a":1}`、实际发送 `{"a":2}`，被拒；查询串改为 `x=2`、路径改为另一个，同样被拒。
- **AC3**：
  - 同一组请求头发送两次：第一次 204，第二次 `REPLAY_DETECTED`。
  - 5 个并发重放中，只有 1 个返回 204，其余 4 个都返回 `401 REPLAY_DETECTED`。
  - 用错误的密钥发一次之后，同一 nonce 加正确的签名仍能通过。
- **AC4**：U+FFFD 与 emoji 的排序按码点；`! ' ( ) *` 被编码；查询串 `q=a+b` 签名通过。
- **整体**：集成测试共 41 条，全部通过；`pnpm verify`、`knip`、`check:sig-vectors` 都通过。
- **自审中改正**：重放测试的第一版靠直接往 Redis 写入 nonce 来模拟「已使用」，不是真实的重放。已改为测试专用路由上的端到端重放。
- **下一步**：P2-SRV-07（App Attest 验证）。
