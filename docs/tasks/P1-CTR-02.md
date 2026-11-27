# P1-CTR-02 公共 API 的 zod 定义与 `openapi.yaml` 生成；CI 校验一致性

## 目标
把 02 §4.2 的公共 API（前缀 `/v1`）落成 zod 契约，生成 `packages/contracts/dist/openapi.yaml`（入库）。CI 校验生成物与源一致，并完成 05 §1.2 的 V3：生成结果能被 swift-openapi-generator 消费，生成的 Swift 客户端能编译（P1 出口条件之二）。

## 依据
- 架构：00 §2.2（`pnpm contracts:gen`）、§3.1；02 §4.1（请求头）、§4.2（接口表）、§10（签名与设备证明）、§23.1（`PATCH /me`）、§23.3（`ageConfirmed`）；ADR 0018（配置包签名信封）
- 依赖：05 §1.2 V3、§4.1（`zod-to-openapi`）、§4.5（swift-openapi 三件套）

## 交付物
- `packages/contracts/src/prefs.ts`、`src/api/{auth,me,jobs,misc}.ts`、`src/openapi.ts`、`src/openapi-setup.ts`、`scripts/gen-openapi.ts`
- `packages/contracts/dist/openapi.yaml` 与副本 `apps/ios/Packages/APIClient/Sources/APIClient/openapi.yaml`
- `apps/ios/Packages/APIClient`（SPM，swift-openapi-generator 构建插件；生成代码不入库）
- 根脚本 `pnpm contracts:gen`、`pnpm contracts:check`；`ci` 加一步一致性检查；新工作流 `.github/workflows/contracts.yml`（macOS 上运行 ReaderCore 与 APIClient 的 `swift test`）

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 02 §4.2 接口表中的 20 个接口全部生成；每个接口的鉴权、签名头、Attest 头、幂等键与接口表一致，由测试解析文档表格比对 —— 测试输出
2. `pnpm contracts:check` 在生成物过期时以非 0 退出，一致时通过；已加入 `ci` —— 输出
3. V3：swift-openapi-generator 消费生成的 `openapi.yaml`，客户端在 macOS 与 iOS 模拟器上编译并通过测试 —— 输出
4. `pnpm verify`、`knip`、`ci` 与 `contracts` 两个工作流全绿

## 范围外
admin-api 契约（P9）；`Networking` 包的中间件链（P4-IOS-04）；服务端路由实现（P2、P3）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p1-ctr-03` 上。

- **接口表**：02 §4.2 共 20 个接口，鉴权分为无、JWT、JWT + 签名、JWT + 签名 + Attest + 幂等键、refresh token + Attest、Apple JWS 几类。
- **请求头**：02 §4.1 与 01 §8 给出 `X-Client-Version`、`X-Ts`、`X-Nonce`、`X-Sig`、`Idempotency-Key`。
- **依赖版本**：`zod-to-openapi` 9.1.0 的 peer 为 zod ^4；swift-openapi 三件套在 05 中已登记为「已定」（原定 P4）。

## 计划（助手填写）
- **请求与响应**：凡是接口表写明的字段都按表定义。表中只写了一个名词的响应体（`user`、样帖列表、配置包等）按最小合理结构定义，并列入下面的问题。
- **生成**：用 `OpenAPIRegistry` 注册所有路由，每个路由都有稳定的 `operationId`（Swift 方法名由它生成）；默认响应统一为 problem+json；生成 OpenAPI 3.1.0。
- **测试**：从 02 §4.2 的表格解析「方法 + 路径」与鉴权列，与生成的文档逐项比对；另做变异测试，证明这一比对确实能发现偏差。

## 风险与问题（助手填写）
- **Q1 接口表中只写了名词的响应体，按最小结构定义，待负责人确认**：
  - `AuthSession.user`：`userId`、`homeRegion`、`tier`。
  - `Me.entitlements`：`densities`、`styles`。
  - `QuotaReference.items[].category`：`audio_minute`、`translation_kchar`、`orchestration_ktoken`。
  - 样帖：`sampleId`、`title`、`lang`、`audioUrl`、`expiresAt`、`durationMs`、`script[]`。
  - 配置包：`bundle`（base64）与 `signature{alg, kid, sig}`（ADR 0018）。
- **Q2 `X-Ts` 的单位**：默认为毫秒，与 P1-CTR-03 Q3 中 `hello.ts` 的单位一致。
- **Q3 设备证明请求头的名称**：设计中没有给出。默认为 `X-Attest-Key-Id` 与 `X-Attest-Assertion`。
- **Q4 `streamUrl`**：契约限定为 `ws://` 或 `wss://`；生产环境应只用 `wss://`，由服务端配置保证。
- **R1 zod-to-openapi 与 zod 4 的组合有一个陷阱**：zod 4 在创建 schema 时把方法挂到实例上，所以 `extendZodWithOpenApi` 只对补丁之后创建的 schema 生效。现在由 `openapi-setup.ts` 先打补丁，再动态加载契约，`buildOpenApiDocument` 在加载顺序不对时会直接报错并说明原因。补丁是全局副作用，只在生成 OpenAPI 的进程中使用，不从 `index.ts` 导出。
- **R2 共享枚举在 OpenAPI 中是内联的**：例如 `ErrorCode` 在各处都会生成单独的 Swift 类型（`ProblemDetails.CodePayload`）。`registry.register()` 返回的是新的 schema 实例，原实例被其他 schema 引用时不会变成 `$ref`。要让 Swift 侧共用同一个类型，需要在定义处就用 `.openapi('Name')` 命名，这会改变契约的写法，留作后续处理。
- **R3 CI 的 Xcode 版本**：GitHub macOS 运行器默认是 Xcode 26.x，不是项目基线 27.2，只用于补充检查。另外 `xcodebuild` 需要 `-skipPackagePluginValidation`（SwiftPM 对构建插件的信任确认），Xcode Cloud（P4）需要做同样的配置。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC3 已完成；AC4 见 PR 的 CI**
- **AC1**：`openapi.test.ts` 共 48 条：20 个接口逐一核对是否生成、鉴权是否与接口表一致，以及 operationId 唯一、默认响应为 problem+json、每个接口都带 `X-Client-Version`、版本号三处一致等结构检查。
  - 唯一一个表外接口是 02 §23.1 的 `PATCH /me`。
  - 变异测试：临时去掉 `POST /auth/logout` 的签名要求，这条比对随即失败；恢复后 contracts 包全部 135 条（后来增至 136 条）通过。
- **AC2**：`pnpm contracts:check` 在生成物一致时输出 `一致性：通过`；生成物过期时输出 `过期：…` 并以 1 退出（首次生成前就是这种状态）。已加入 `ci`。
- **AC3**：
  - macOS 上运行 `swift build`，生成器的输出为 `Generator modes: types, client`、`Build complete!`。
  - macOS 上运行 `swift test`，2 条测试通过：关键操作都已生成；`ProblemDetails` 能正确解码 `DAILY_LIMIT`，遇到未知 code 时解码失败。
  - iOS 27.2 模拟器上运行 `xcodebuild test`，结果为 `** TEST SUCCEEDED **`。
  - 生成器配置采用 `namingStrategy: idiomatic`，生成的名称符合 Swift 习惯（例如 `.dailyLimit`）。
- **过程中修复**：链接检查原先会扫描 SwiftPM 的 `.build/checkouts`，已把 `.build`、`.swiftpm` 加入跳过列表。
- **文档同步**：05 升到 v1.7（V3 已验证，依赖登记）；AGENTS.md 命令表中 `contracts:gen`、`spec:vectors` 改为可用。
- **下一步**：P1-CTR-04（`config-schema`），需要负责人先提供标定参数，见 STATUS.md。
