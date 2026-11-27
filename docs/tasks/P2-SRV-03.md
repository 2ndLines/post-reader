# P2-SRV-03 `platform/redis`：连接、令牌桶 Lua、nonce、R_daily、会话吊销、验证码冷却

## 目标
按 02 §10.3、§11.3 与《完整技术架构》§12.1 的键设计实现 Redis 原语，用真实 Valkey 做集成测试；只使用 Redis 7.0 社区版命令（ADR 0011）。

## 依据
- 架构：02 §10.3（nonce）、§11.3（限流）；《完整技术架构》§12.1（键、类型、TTL）；ADR 0011；ADR 0017 约束 4（BullMQ 连接）
- 依赖：05 §4.2（`ioredis`：普通命令与阻塞读分开连接；Lua 脚本放在 `platform/redis/scripts/` 并有单测）

## 交付物
- `apps/server/src/platform/redis/client.ts`、`limits.ts`、`scripts/token-bucket.lua`；单元测试与集成测试
- `integration` 工作流加入 Valkey service 容器；镜像一致性检查推广到 compose 中的全部镜像

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 令牌桶：容量用尽后拒绝并给出等待时间；按速率补充后恢复；并发请求只放行容量个数（原子性）；键带 120 s 的 TTL —— 集成测试
2. nonce：同一会话首次通过、重放拒绝、并发重放只有一个成功，TTL 为 600 s —— 集成测试
3. R_daily：超过上限即拒绝，TTL = 到当地午夜的剩余时间 + 1 小时，按日期分开计数；会话吊销与验证码冷却按键设计工作 —— 集成测试
4. Lua 脚本中的命令都在 Redis 7.0 白名单内 —— 单元测试
5. `pnpm verify`、`knip`、`ci` 与 `integration` 工作流全绿

## 范围外
Redis Streams 与 BullMQ 队列（P3）；把限流挂到路由上（P2-SRV-05、P3-SRV-01）；令牌桶的正式参数（未标定，见 P1-CTR-04）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p2-srv-02` 上。

- 键设计见《完整技术架构》§12.1：`rl:tb:{scope}:{id}`（Hash，120 s）、`nonce:{sid}:{nonce}`（600 s）、`rl:daily:{userId}:{yyyymmdd}`（到当日结束 + 1 小时）、`sess:revoked:{sid}`（访问令牌的剩余有效期）、`otp:cd:{emailHash}`（120 s）。

## 计划（助手填写）
- **令牌桶**：用一段 Lua 原子地完成补充与扣减，时间取 Redis 服务端的 `TIME`，避免多实例时钟不一致。
- **其余原语**：直接用 `SET NX EX`、`INCR` 加 `EXPIRE` 等单条命令完成。
- **测试**：每次运行使用随机键前缀，ioredis 会把前缀加到 `EVAL` 的 KEYS 上，结束时只清理本次的键。

## 风险与问题（助手填写）
- **Q1 超过 R_daily 时计数不回退**：超限的请求同样计入当日次数。按主 PRD 11.2，超限时不发起合成、不扣配额，计数是否回退没有写明。默认不回退，待负责人确认。
- **R1 令牌桶参数**：容量与补充速率未标定（P1-CTR-04），由调用方从 `quotas.yaml` 读取；生产环境存在未标定参数时拒绝启动。
- **R2 `countDailyJob` 中 `INCR` 与 `EXPIRE` 不是原子的**：首次 `INCR` 之后、`EXPIRE` 之前进程崩溃，会留下一个没有 TTL 的计数键。影响仅限于该用户当日的计数键无法自动过期。可以改为 Lua 或 `SET NX EX` 后再 `INCR`，留待挂到路由时（P3-SRV-01）一并处理。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC4 已完成；AC5 见 PR 的 CI**
- **集成测试**：Redis 9 条，加上 PostgreSQL 8 条，共 17 条，全部通过（真实 Valkey 8.1.12）。
- **AC1**：
  - 容量为 3 时第 4 次被拒，等待时间在 50 ms 以内，80 ms 后恢复放行。
  - 容量为 5 时，20 个并发请求恰好放行 5 个。
  - TTL 不超过 120 s。
- **AC2**：10 个并发重放只有 1 个成功；TTL 在 590 至 600 s 之间。
- **AC3**：上限为 2 时第 3 次被拒；TTL 在 4500 至 4600 s 之间（午夜前剩余 1000 s 加 3600 s）。
- **AC4**：`token-bucket.lua` 只用到 `TIME`、`HMGET`、`HSET`、`PEXPIRE`。
- **单元测试**：commands 连接的 `maxRetriesPerRequest` 为 3，blocking 与 queue 连接为 `null`（BullMQ 要求）。
- **过程中修复**：
  - 集成测试最初绕开封装直接 `new Redis`，knip 因此报 `client.ts` 未被使用。改为使用 `createRedis` 后，测试覆盖的就是生产中实际使用的连接配置。
  - 一次脚本替换没有匹配到被 Biome 换行后的代码，由类型检查拦下，已修正。
- **CI**：`integration` 工作流加入 Valkey；`turbo.json` 透传 `TEST_REDIS_URL`；镜像一致性检查扩展到 compose 中的全部镜像。
- **下一步**：P2-SRV-04（`platform/kms` 与字段加密）。
