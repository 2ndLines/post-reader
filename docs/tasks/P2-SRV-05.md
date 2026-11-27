# P2-SRV-05 `auth`：邮箱验证码、Sign in with Apple（Apple 接口 mock）、令牌签发与轮换

## 目标
实现登录、刷新、吊销与访问令牌认证（P2 出口条件的「登录、刷新、吊销」部分），使用真实 PostgreSQL 与 Valkey 做全流程集成测试。

## 依据
- 架构：02 §4.2（接口表）、§6.1（Sign in with Apple 时序）、§10.1（令牌）、§11.3（验证码冷却）、§23.3（年龄确认）；《完整技术架构》§11.3（Apple 令牌在注销时吊销）、§12.1（键设计）；ADR 0001（区域按店面判定）
- 契约：`packages/contracts` 的 `AppleSignInRequest`、`EmailCodeRequest`、`EmailVerifyRequest`、`AuthSession`、`RefreshRequest`、`RefreshResponse`
- 依赖：05 §4.2（`jose`：显式限定 algorithms）

## 交付物
- `apps/server/src/modules/auth/`（受保护路径）：`tokens.ts`、`apple.ts`、`email.ts`、`service.ts`、`routes.ts`；单元测试与集成测试

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 邮箱验证码：首次登录注册新用户（DEK、加密的邮箱、加密的会话密钥），再次登录为同一用户；120 s 冷却；5 次错误后锁定；验证码只能用一次；首次注册未确认年满 18 岁时拒绝 —— 集成测试
2. Sign in with Apple：identityToken 验签、nonce 与 audience 校验；Apple refresh token 加密存储 —— 集成测试（本地生成的 JWKS）
3. 刷新轮换：旧 refresh token 被重用时吊销整个 family，已签发的访问令牌一并失效；并发刷新只有一个成功；退出登录后访问令牌立即失效 —— 集成测试
4. 访问令牌：只接受 ES256；过期、伪造签名、未知 kid 都拒绝；支持多把公钥并存以便轮换 —— 单元测试
5. 店面属于另一区时 REGION_MISMATCH；日志中不出现邮箱与验证码 —— 集成测试
6. `pnpm verify`、`knip`、`ci` 与 `integration` 工作流全绿

## 范围外
请求签名校验（P2-SRV-06）；App Attest（P2-SRV-07，`/auth/refresh` 的 Attest 要求在该卡挂载）；频控挂载（参数未标定）；真实的 Apple 令牌接口与邮件服务（需要 Apple 账号与邮件厂商合同：P4、P3）；进程启动时装配签名密钥与 KMS（依赖凭据服务，P3）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p2-srv-04` 上。

- 令牌形式见 02 §10.1：访问令牌为 ES256 JWT，15 分钟；refresh token 为 32 字节随机数，30 天，每次刷新轮换，旧令牌被重用时吊销整个 family；`k_sess` 用用户 DEK 加密存储。
- 02 §6.1 给出了 Sign in with Apple 的时序：验签 → 换取 Apple refresh token → 新用户生成 DEK → 写入会话。

## 计划（助手填写）
- **identityToken 校验**：真实实现，依赖注入 JWKS，测试中用本地 RS256 密钥对。
- **authorizationCode 换 Apple refresh token**：定义为接口，测试中 mock。
- **邮件发送**：定义为接口，本地实现是内存发件箱。
- **刷新**：用条件 `UPDATE … WHERE revoked_at IS NULL RETURNING` 领取旧会话。
- **注册**：在同一个事务中写入 `users`、`user_keys` 与 `auth_identities`。
- **自动关联账号**：不做。不同的登录方式即使邮箱相同，也不自动并到同一账号，以免账号被他人接管。

## 风险与问题（助手填写）
- **Q1 并发刷新**：同一个 refresh token 被并发提交时，只有一个成功，其余按「重用」处理并吊销整个 family。客户端如果在网络重试中重复发出刷新请求，会被迫重新登录。默认采用更安全的做法，待负责人确认；P4 的客户端要保证刷新请求串行。
- **Q2 新用户的计费时区**：登录请求里没有设备时区（契约未包含）。默认国内区为 `Asia/Shanghai`，海外区先用 `UTC`，等客户端通过 `PATCH /me` 上报（02 §23.1）。
  - 另一种做法是在登录请求中加入可选的 `timeZone` 字段（契约改动）。待负责人选择。
- **Q3 无效的访问令牌**：签名错误、未知 kid 等情况也返回 `AUTH_EXPIRED`，因为 `ErrorCode` 中没有「令牌无效」，而两种情况对客户端的处理相同（刷新或重新登录）。
- **Q4 同一邮箱、不同登录方式**：不自动关联。例如先用 Apple 登录（Apple 提供了邮箱），之后用同一邮箱的验证码登录，会是两个账号。待负责人确认。
- **R1 生产装配**：ES256 私钥（`JWT_SIGNING_KEY_REF`）、邮箱 HMAC 密钥、云 KMS、Apple JWKS 与 Bundle ID 都要从凭据服务与 Apple 账号取得，进程入口目前还没有挂载认证路由（P3、P4）。
- **R2 用户档位**：目前固定为 `free`，接入订阅后从订阅状态读取（P7）。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC5 已完成；AC6 见 PR 的 CI**
- **集成测试**：认证 15 条，全部集成测试共 34 条，都通过。
  - **AC1**：
    - 新用户的邮箱经 DEK 加密，解密后为规范化（小写）的地址；会话密钥加密存储，解密后与响应一致；数据库中的 `refresh_hash` 不是明文。
    - 同一邮箱大小写不同时为同一用户；首尾带空白的邮箱被契约拒绝（400）。
    - 未确认年满 18 岁返回 `age_confirmation_required`；120 s 内重复发送返回 429。
    - 连续 5 次错误之后，即使输入正确的验证码也返回 `RATE_LIMITED`；用过的验证码再次提交返回 400。
  - **AC2**：Apple 登录成功后，`provider_refresh_enc` 解密后与 mock 返回的值一致；nonce 不符、audience 不是本应用都返回 400 `identityToken`。
  - **AC3**：
    - 旧 refresh token 被重用时返回 `AUTH_REVOKED`，此后新的 refresh token 与访问令牌也都失效。
    - 5 个并发刷新只有 1 个成功。
    - 退出登录后，访问令牌与 refresh token 都返回 `AUTH_REVOKED`。
  - **AC5**：海外区收到 `CHN` 店面时返回 403 `REGION_MISMATCH`；日志中没有出现邮箱与验证码。
- **AC4**（单元测试，7 条）：签发与验证、过期、两把公钥并存（轮换）、未知 kid、同一 kid 但私钥不同、用 HS256 签发的令牌被拒、refresh token 与会话密钥的长度。
- **测试中修正**：我原先以为邮箱首尾的空白会被去掉，实际是契约的 `z.email()` 直接拒绝。保持契约严格，由客户端负责去除。
- **审阅中补上**：`authorizationCode` 换回的 Apple refresh token 原先被丢弃，现在加密存入 `provider_refresh_enc`，供注销时吊销 Apple 令牌。
- **下一步**：P2-SRV-06（请求签名中间件与重放测试）。
