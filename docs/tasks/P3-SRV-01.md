# P3-SRV-01 jobs：表、状态机、`POST /jobs`、事件流

## 目标
实现 jobs 模块（02 §5.4）：三张表与迁移、状态机、`POST /jobs`（摘要重算、幂等、预检）、`GET /jobs/{id}`、`POST /jobs/{id}/cancel`，以及下行事件流的写入。

## 依据
- 手册：playbook §6.5（P3-SRV-01）
- 架构：02 §4.2（接口表与 `POST /jobs` 服务端校验清单）、§5.4、§6.2、§11.1（表定义节选）、§11.2（Streams）、§11.3（R_daily）、§4.3（WS 地址 `/v1/stream`，取消写 `job:{id}:state.cancelled`）；《完整技术架构》§4.1（幂等键保留 24 小时）、§8.4（至少一次投递）、§9.1（状态机）、§11.1（表的列清单）；00 §4.2（`task_id`、`post_key`）
- 契约：`packages/contracts` 的 `CreateJobRequest`、`CreateJobResponse`、`JobStatus`、`ServerMsg`
- 配置：`config/quotas.yaml`（`limits`、`dailyJobLimit`）、`tiers.yaml`、`langs.yaml`

## 交付物
- `apps/server/src/modules/jobs/`：`schema.ts`、`state.ts`、`validate.ts`、`local-day.ts`、`service.ts`、`routes.ts`；迁移 `drizzle/0001_jobs.sql`（受保护路径）
- `platform/http`：`DAILY_LIMIT` 的 problem+json 带 `resetAt`（`dailyLimitError`）
- 测试：`state.test.ts`、`validate.test.ts`、`local-day.test.ts`、`jobs.int.test.ts`；测试辅助 `test-post.ts`（合成帖子）、`auth/signing-client.ts`（从 `auth.int.test.ts` 抽出的客户端签名）
- server 新增工作区依赖 `@post-reader/canonical-spec`、`@post-reader/config-schema`（仓库内的包，不是第三方依赖）

## 验收标准（助手起草，2026-11-27；负责人确认前视为草案）
1. 校验清单 5 条各有通过与拒绝用例：单元数与长度上限、摘要重算、档位权益（`TIER_REQUIRED`）、PUBLIC 白名单、目标与直通语言、Tier 3 源语种忽略 `original` —— 单元测试
2. 创建：201，任务为 `admitted`，正文用用户 DEK 加密存储，投递到 `jobs:dispatch`；`task_id` 与 `post_key` 格式符合 00 §4.2 —— 集成测试
3. 幂等：同一键同一请求体返回 200 与原任务，不新建、不计入 R_daily；同一键不同请求体拒绝；同一键并发只建一个任务；幂等键按用户区分 —— 集成测试
4. 预检：额度为 0 返回 `QUOTA_EXHAUSTED`，R_daily 超限返回 `DAILY_LIMIT` 并带 `resetAt`；被拒绝的请求不写任务、不投递 —— 集成测试
5. 鉴权：缺签名被拒；设备断言必须来自本会话的设备；别人的任务查询与取消都返回 `NOT_FOUND` —— 集成测试
6. 状态机：主链按顺序推进、终态不能再转移；转移是条件更新，并发下只有一个成功 —— 单元测试与集成测试
7. 事件：`appendEvent` 的 seq 单调递增，消息按契约校验 —— 集成测试
8. `pnpm verify`、`pnpm test:int`、`knip`、迁移不可变检查、`ci` 与 `integration` 工作流全绿

## 范围外
- `POST /jobs/{id}/ack`：确认播放位置并触发私有缓存删除，依赖切片存储，在 P3-PIPE-03 实现。在此之前该接口返回 404。
- 额度预检的真实实现：`quota` 模块（P3-SRV-04）。本卡定义 `QuotaPrecheck` 接口，测试注入。
- 消费 `jobs:dispatch` 并推进状态：orchestrator（P3-PIPE-02）。
- WebSocket 网关读取事件流：P3-SRV-02。
- `job_segments` 按月分区与各表的保留期任务（02 §18.6）。
- 进程入口装配 jobs 路由：与认证路由一起，在 Apple 与 KMS 的生产配置就绪后（P3–P4）。

## 上下文摘要（助手填写）
填写于 2026-11-27，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p2-srv-09` 上，因为它用到其中的用户令牌桶。

- 02 §11.1 只给了 `jobs` 与 `job_units` 的节选。《完整技术架构》§11.1 给出了 `job_segments` 的列。
- 列名有两处不一致：02 写 `server_text_sha256`、`ord`，《完整技术架构》写 `server_hash`、`order`。按 02（后端设计文档）。
- 状态机：`created` 在通过校验与幂等检查后进入，`admitted` 在额度、R_daily、签名与 Attest 通过后进入。
- 幂等键在服务端保留 24 小时（《完整技术架构》§4.1）。
- P1 规格冻结（SPEC-01 Q1–Q7）尚未完成。摘要重算直接调用 `canonical-spec` 的 `unitHash`，规格若有修改，由同一个包统一改动。

## 计划（助手填写）
- **表**：按 02 §11.1 建表，另外加三列。
  - `read_mode`、`passthrough_langs`：节选中没有，但流水线需要。
  - `request_sha256`：用来识别同一幂等键配不同请求体的情况。
  - `job_units.position`：上报时的顺序。`ord` 是编排后的播放顺序，两者不同。
- **创建流程**：幂等检查 → 校验清单 → 额度预检 → R_daily → 一个事务里写 `jobs` 与 `job_units` → `XADD jobs:dispatch`。
  - 被拒绝的请求不写任务行，客户端修正后可以用同一个键重试。
  - 通过校验的任务直接写为 `admitted`。`created` 只存在于请求处理期间，不落库（Q1）。
- **并发幂等**：`INSERT … ON CONFLICT (user_id, idempotency_key) DO NOTHING`，没有插入成功的一方读取原任务并返回 200。
- **投递失败**：写库成功但 `XADD` 失败时，请求返回 500，任务停在 `admitted`。客户端用同一个键重试时会补投；消费者按 jobId 幂等处理（《完整技术架构》§8.4：至少一次投递）。
- **R_daily**：按用户的 `billing_tz` 计算当日，`resetAt` 为该时区的次日 0 点，按实际偏移计算，夏令时切换日也正确。
- **未标定参数**：做法与 P2-SRV-09 相同。生产环境拒绝启动；其他环境不限制该项，并在启动时列出。

## 风险与问题（助手填写）
- **Q1 `created` 不落库**：被拒绝的请求不留记录，`rejected` 留给之后的流程使用（例如机审拦截主帖）。默认按此实现；如需审计被拒请求，另加无内容的计数指标。
- **Q2 幂等键**：
  - **格式**：可打印 ASCII，1–128 个字符。
  - **同一键不同请求体**：返回 400 `VALIDATION_FAILED`（`detail: Idempotency-Key`）。`ErrorCode` 没有冲突类的码。
  - **保留期**：键随任务保留（30 天），比要求的 24 小时更长。
  - 以上都待负责人确认。
- **Q3 转为 `failed` 或 `cancelled`**：《完整技术架构》§9.1 没有列出。默认任何非终态都可以转入这两个状态。
- **Q4 「8,000 字符」的计法**：按 Unicode 码点计，不按 UTF-16 长度，所以 emoji 不会被多算。
- **Q5 Tier 3 源语种**：创建任务时只知道站点给的 `langHint`。有 `langHint` 且属于 Tier 3 时，把 `original` 改为 `translated`；没有 `langHint` 时，由流水线的语种判定处理。
- **Q6 取消标记的保留时间**：`job:{id}:state` 设 24 小时过期，避免键无限累积。该值为默认，待确认。
- **Q7 HTTP 状态码**：`QUOTA_EXHAUSTED` 402、`TIER_REQUIRED` 403、`DAILY_LIMIT` 429。文档只规定了 `code`，状态码是默认值，客户端只按 `code` 分支处理。
- **R1 `traceparent`**：`jobs:dispatch` 的消息按 02 §11.2 应带 `traceparent`，本卡没有带。写入它需要直接依赖 `@opentelemetry/api`，按规定要先写 ADR，所以等 orchestrator（P3-PIPE-02）接入追踪时一并处理。
- **R2 事件流的保留**：`job:{id}:events` 与 `job:{id}:seq` 目前没有设置过期与长度上限，由 P3-SRV-02（WS 网关、`resume`）确定保留窗口。
- **R3 一处测试期望的调整**：`auth/schema.int.test.ts` 原来断言数据库里恰好有 5 张表，新增迁移后改为「包含身份相关的 5 张表」。它是迁移测试，不是门禁阈值。

## 交接记录（会话结束时填写）
**2026-11-27 · AC1–AC7 已完成；AC8 见 PR 的 CI**
- **单元测试**：新增 16 条，server 共 116 条。
  - 校验清单：7 条
  - 档位权益解析：2 条
  - 状态机：3 条
  - 计费时区的当日：4 条，含美东夏令时开始与结束的两天
- **集成测试**：新增 13 条，全部集成测试共 66 条。
  - 签名与 App Attest 都开启（`enforce: true`），用合成证书链登记设备。
  - 覆盖创建、幂等（含 5 个并发）、额度与 R_daily 拒绝、别人的设备断言、缺签名、查询与取消的权限、条件转移、事件流。
- **检查**：`pnpm verify`、`knip`、`lint`、迁移不可变检查、许可证检查都通过。
- **下一步**：P3-SRV-02（WebSocket 网关）或 P3-SRV-04（quota）。两者都不需要外部账号。
