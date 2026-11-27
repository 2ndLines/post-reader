# P2-SRV-09 频控挂载（认证接口）

## 目标
把 P2-SRV-03 的令牌桶原语挂到 02 §4.2「频控」列要求的认证接口上，补齐 P2 出口条件中「集成测试覆盖频控」一项。参数仍未标定时不编造数值。

## 依据
- 手册：playbook §6.4 出口条件（集成测试覆盖登录、刷新、吊销、签名、重放与频控）
- 架构：02 §4.2 接口表的「频控」列（`/auth/apple`、`/auth/email/code`：IP 令牌桶；`/auth/refresh`：用户令牌桶）、§11.3（键 `rl:tb:{scope}:{id}`，容量与速率来自 `quotas.yaml`）；00 §3.1（`RATE_LIMITED` 只表示令牌桶频控）
- 配置：`config/quotas.yaml` 的 `tokenBuckets.ip`、`tokenBuckets.user`（P1-CTR-04，未标定）

## 交付物
- `apps/server/src/platform/http/rate-limit.ts`：`resolveRateLimits`、`enforceBucket`、`ipRateLimit`、`RateLimitError`（429 并带 `Retry-After`）
- `authRoutes` 新增依赖 `rateLimits`；`AuthService.refresh` 新增 `beforeRotate` 回调（受保护路径）
- 单元测试 `rate-limit.test.ts`；集成测试 `rate-limit.int.test.ts`

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. `/auth/email/code` 同一 IP 超过容量后返回 429 `RATE_LIMITED` 并带 `Retry-After`，被限流的请求不发验证码；其他 IP 不受影响 —— 集成测试
2. `/auth/apple` 在验证 identityToken 之前限流 —— 集成测试
3. `/auth/email/verify` 不挂 IP 令牌桶（02 §4.2 只写了每邮箱 5 次） —— 集成测试
4. `/auth/refresh` 同一用户超过容量后 429；被拒绝时旧 refresh token 没有被轮换，桶补充后仍可使用；无效的 refresh token 先被会话校验拒绝 —— 集成测试
5. 生产环境有未标定的桶时拒绝启动；非生产环境关闭该桶并列出 —— 单元测试
6. `pnpm verify`、`pnpm test:int`、`knip`、`ci` 与 `integration` 工作流全绿

## 范围外
- 标定值本身（负责人提供，P1-CTR-04）。
- `/attest/*` 的「设备」频控：`quotas.yaml` 没有对应参数，待《风控与反滥用策略规范》给出。
- `/quota/reference`、`/subscriptions/sync`、`POST /jobs` 的用户令牌桶：路由在 P3 及以后实现，届时用同一个 `enforceBucket`。
- 进程入口装配认证路由（需要 Apple 与 KMS 的生产配置，P3–P4）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p2-srv-08` 上。

- P2-SRV-03 已实现 Lua 令牌桶，并在真实 Valkey 上测过原子性；但路由上没有挂载，P2 出口条件的「频控」只满足了一半。
- 参数在 `quotas.yaml` 中标为未标定；`check:config --production` 在有未标定值时失败。
- `/auth/refresh` 的用户要等会话查到之后才知道，所以用户令牌桶只能在 service 里、会话校验之后执行。

## 计划（助手填写）
- **参数解析**：`resolveRateLimits(tokenBuckets, nodeEnv)`。生产环境遇到未标定的值直接抛错，与配置检查一致；其他环境把该桶设为 `null`（关闭），并返回被关闭的名字，供启动日志列出。
- **IP 令牌桶**：作为 preHandler 挂在 `/auth/apple` 与 `/auth/email/code` 上。Fastify 在 preHandler 之前完成请求体校验，所以格式错误的请求返回 400，不消耗令牌。
- **用户令牌桶**：`AuthService.refresh` 在会话校验通过后、轮换之前调用 `beforeRotate(userId)`。超限时不轮换，旧 token 仍可用，客户端按 `Retry-After` 重试即可，不会被迫重新登录。
- **测试**：集成测试用测试专用的小参数；已有的两个集成测试给足够大的桶，让代码路径照常执行。
- **新依赖**：无。

## 风险与问题（助手填写）
- **Q1 非生产环境的未标定桶**：默认关闭该桶并在启动时列出，开发与预发不会因缺参数而无法启动。如果负责人要求预发也必须有参数，改为只在 `development`、`test` 下允许关闭。
- **Q2 代理后的客户端 IP**：`request.ip` 目前取 TCP 对端地址。部署在负载均衡之后时，要为 Fastify 配置 `trustProxy`（限定为负载均衡的网段），否则所有请求共用一个桶。属于部署配置（P5 起），本卡不设。
- **Q3 `Retry-After`**：429 响应带标准的 `Retry-After` 头（秒，向上取整，至少 1）。`openapi.yaml` 目前没有声明这个响应头。属于新增的可选头，客户端可以忽略；确认后再写进契约。
- **R1 失败语义**：Redis 不可用时 `enforceBucket` 抛错，请求返回 500，即失败即关闭，不会在 Redis 故障时放开频控（由代码路径推断，本卡没有专门的测试）。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC5 已完成；AC6 见 PR 的 CI**
- **集成测试**：新增 5 条，全部集成测试共 53 条，都通过。
- **单元测试**：新增 4 条，server 共 100 条。
- **检查**：`pnpm verify`、`knip`、`lint` 都通过。
- **P2 出口条件**：现在登录、刷新、吊销、签名、重放、频控都有集成测试，日志脱敏测试在 P2-SRV-01。P2 阶段评审由负责人进行。
