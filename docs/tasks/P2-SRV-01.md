# P2-SRV-01 `platform`：环境变量校验、日志脱敏、OTel 初始化、Fastify 工厂、problem+json、健康检查

## 目标
建立 `apps/server` 的平台层与进程入口（02 §3、§4.1、§12、§13），为 P2 后续各卡提供可挂载的 HTTP 基座。

## 依据
- 架构：02 §2（目录）、§3.2（启动顺序）、§3.3（环境变量）、§4.1（插件与钩子顺序）、§12（错误处理）、§13（可观测性）；00 §4.4
- 依赖：05 §4.2（fastify、@fastify/helmet、pino、OpenTelemetry，P2 已定）
- 手册：playbook §6.4（P2 出口条件：日志脱敏测试通过）、§8.2

## 交付物
- `apps/server/src/platform/env.ts`、`logger.ts`、`otel.ts`、`http/app.ts`、`http/errors.ts`、`http/zod.ts`
- `apps/server/src/entry/main.ts`
- 对应的测试

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 环境变量校验失败时，进程以 1 退出，输出只含变量名，不含变量值 —— 测试（子进程）
2. 02 §13.1 列出的 redact 路径全部生效；请求体整体屏蔽 —— 测试
3. 错误统一为 problem+json（含 `code`、`traceId`）：AppError、校验失败（只含字段路径）、404、未知错误（响应与日志都不含错误信息原文） —— 测试
4. 响应 schema 是字段白名单 —— 测试
5. SIGTERM 时 `/readyz` 变为 503 并优雅退出（退出码 0） —— 测试（子进程）
6. `pnpm verify`、`knip`、许可证检查、CI 全绿

## 范围外
数据库与迁移（P2-SRV-02）、Redis（P2-SRV-03）、KMS（P2-SRV-04）、认证（P2-SRV-05）、签名（P2-SRV-06）、Attest（P2-SRV-07）；配置包拉取与验签、`clientVersionGuard`（依赖 `config/clients.yaml`）；Sentry（P3）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。按 playbook，P2 应在负责人完成 P1 阶段评审后再开始；负责人以 `/goal` 要求自行完成，按手册 §0.1，负责人在当前任务中的明确指示优先，因此 P1 阶段评审延后由负责人进行，记录在 STATUS.md。本卡叠在 `feat/p1-ctr-04` 上。

- 02 §3.3 列出了全部环境变量；§13.1 规定了 pino 的 redact 路径；§12 规定了 AppError 与 problem+json。
- 05 规定 OTel 必须关闭会记录 SQL 参数、请求体或 URL 查询串的选项，span 中不得含有用户数据。

## 计划（助手填写）
- **env**：zod 校验，失败时抛出只含变量名的 `EnvError`。本卡只把 PostgreSQL 与 Redis 的连接串设为必填，其余变量在各自的卡中改为必填。
- **logger**：redact 路径作为常量固定，调用方不能缩减；每条日志带 `region` 与 `role`。
- **otel**：只装用到的插桩（HTTP、pino），不采集请求与响应头，span 中的 URL 去掉查询串；没有配置端点时不启动。
- **HTTP**：
  - 自写 zod 校验器与序列化器：响应先按 schema 解析再序列化，未声明的字段被丢弃。
  - errorHandler 遇到未知错误时只记录错误类型与调用栈，不记录错误信息原文。
  - `/v1/healthz`、`/v1/readyz`，以及 SIGTERM 时的优雅停机。
- **进程入口**：按 §3.2 的顺序启动；第 3 步（连接数据库、Redis，拉取配置包）留给后续卡。

## 风险与问题（助手填写）
- **Q1 不使用 `fastify-type-provider-zod`**（偏离 05）：它的 v7 把 `@fastify/swagger`、`openapi-types` 列为必需的 peer，会引入未登记的依赖。
  - 默认：自写校验器与序列化器（`platform/http/zod.ts`），05 已同步。
  - 如果负责人希望用它，需要先给 `@fastify/swagger` 写依赖 ADR。
- **Q2 不使用 `auto-instrumentations-node`**（偏离 05）：它的依赖树带入 4 个 BlueOak-1.0.0 许可证的包，路径为 GCP 资源探测器 → gaxios → rimraf → glob，被许可证门禁拦下。
  - 默认：只安装需要的插桩。负责人在 ADR 0017 约束 6 中决定接受 BlueOak 之后，可以改回。
  - `instrumentation-fastify` 自 2026 年 3 月起没有更新，未采用；HTTP 插桩已能覆盖请求 span。
- **Q3 `/readyz` 未就绪时的错误码**：返回 503，`code` 为 `INTERNAL`，`detail` 为 `not ready`。`ErrorCode` 中没有专门表示「未就绪」的码，而 `SERVICE_PAUSED` 的含义是「暂停受理」，不适合。待负责人确认。
- **R1 `traceId` 暂时就是 requestId**：接入 OTel 的 trace 上下文之后，改为使用当前 span 的 traceId（P3 接入可观测性时完成）。
- **R2 `protobufjs` 的安装脚本已禁用**：与 ADR 0017 第 7 条一致。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC6 已完成**
- **测试**：36 条全部通过。
- **AC1**：子进程测试中，环境变量不合法时退出码为 1，输出只有 `DATABASE_URL 不合法`，变量值中的 `p4ssw0rd` 没有出现。
- **AC2**：10 个字段都被屏蔽；请求体即使嵌套很深，内容也不会出现在日志里。
- **AC3**：AppError 转为对应的码与状态（402 / `QUOTA_EXHAUSTED`）；校验失败的 `detail` 为 `字段：body.name`，不回显提交的值；404 的 `traceId` 与响应头 `x-request-id` 一致；未知错误时，响应与日志都不含错误信息原文。
- **AC4**：响应中未声明的字段 `leaked` 被丢弃。
- **AC5**：子进程测试中，进程启动后健康检查返回 200；收到 SIGTERM 后以退出码 0 结束。`PORT=0`（随机端口）只允许测试使用。
- **AC6**：`pnpm verify`、`knip`、许可证检查（193 个包）、全部 `check:*` 都通过。
- **顺带更正**：P1-CTR-03 的注释原先写着服务端遇到未知上行 `t` 时「同样忽略」，与 05 §4.2 的「关闭连接」矛盾。已改为：解析函数只把这类消息归为「忽略」，是否关闭连接由网关决定。
- **下一步**：P2-SRV-02（`platform/db` 与首批迁移，用 Testcontainers 做集成测试）。
