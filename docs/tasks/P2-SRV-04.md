# P2-SRV-04 `platform/kms` 与字段加密（本地用文件密钥模拟 KMS）

## 目标
实现字段加密（AES-256-GCM）、用户 DEK 的包裹与解包抽象、DEK 缓存，以及「删除密钥即擦除」的数据路径。本地与测试使用文件密钥模拟 KMS（playbook §6.4）。

## 依据
- 架构：02 §8（`platform/kms`：DEK 解包结果在进程内 LRU 缓存 5 分钟）、§10.1（`k_sess` 用用户 DEK 加密）、§10.4（字段加密格式与加密字段）；《完整技术架构》§11.3（每用户一把 DEK、注销时先删 `user_keys`）
- 手册：playbook §9.4（`platform/crypto`、`platform/kms` 为受保护路径）；根 AGENTS.md 红线（不弱化安全控制）

## 交付物
- `apps/server/src/platform/crypto/field.ts`；`src/platform/kms/types.ts`、`local.ts`、`dek-cache.ts`、`user-keys.ts`；单元测试与集成测试

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 字段加密往返正确，存储格式为 `v1 | iv | ciphertext | tag`，每次加密 iv 不同 —— 单元测试
2. 篡改任一部分（版本、iv、密文、tag）、密钥不对、把密文搬到别的列或别的用户名下，解密都失败 —— 单元测试
3. 本地 KMS 在生产环境拒绝构造；换了主密钥或 keyId，原包裹结果解不开 —— 单元测试
4. DEK 缓存 5 分钟过期、按 LRU 淘汰、`invalidate` 后不再命中 —— 单元测试
5. 删除 `user_keys` 并清缓存后无法再取得 DEK（密码擦除）；缓存命中时不访问 KMS —— 集成测试
6. `pnpm verify`、`knip`、`ci` 与 `integration` 工作流全绿

## 范围外
AWS KMS 与阿里云 KMS 适配器（需要云账号：海外区 P3-INFRA-01，国内区 P10）；配置包签名（ADR 0018，配置发布任务）；注销工单（P8-SRV-01）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p2-srv-03` 上。

- 02 §10.4 规定了字段加密的格式与加密字段（`users.email_enc`、`auth_identities.provider_refresh_enc`、`sessions.session_key_enc`、`job_units.clean_text_enc`、`job_units.translated_enc`）。
- 02 §8 规定 DEK 解包结果在进程内 LRU 缓存 5 分钟。
- 注销时先删除 `user_keys`（《完整技术架构》§11.3），从而使该用户在备份中的密文也无法还原。

## 计划（助手填写）
- 只用 `node:crypto`，不引入依赖。
- 用附加认证数据（AAD）绑定「表.列 + 所有者」。
- 本地 KMS 用 AES-256-GCM 包裹 DEK，以 keyId 作为 AAD；生产环境拒绝构造。
- DEK 缓存利用 `Map` 的插入顺序实现 LRU。

## 风险与问题（助手填写）
- **Q1 字段加密的附加认证数据（AAD）**：设计中没有规定。默认绑定「表.列 + 行的所有者」，防止把密文搬到别的行或别的列后仍能解密。这条规则一旦用于生产数据就不能随意更改，需要负责人在第一次写入生产数据前确认。
- **Q2 密文格式中的版本**：当前为 1 字节的 `0x01`。02 §10.4 写的是 `v1`，没有明确是字面字符串还是字节，默认按版本字节实现，待负责人确认。
- **R1 尚未接入进程启动**：本地主密钥文件的路径变量（例如 `KMS_LOCAL_KEY_FILE`），以及选择本地 KMS 还是云 KMS，都在 P2-SRV-05（认证模块首次使用 DEK）中接入启动流程。
- **R2 DEK 缓存中的密钥以明文形式存在于进程内存**：这是设计允许的做法（5 分钟 LRU），注销时必须调用 `invalidate`。注销流程本身在 P8-SRV-01 实现。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC5 已完成；AC6 见 PR 的 CI**
- **单元测试**：15 条，覆盖加解密往返（含中文、emoji 与空串）、密文格式与长度、4 种篡改、AAD 绑定、错误的密钥、DEK 长度、本地 KMS（往返、换密钥、生产环境拒绝、从文件读取）、缓存（过期、LRU、清除）。
- **集成测试**：2 条，在真实 PostgreSQL 上验证：`user_keys` 中保存的是包裹后的 DEK（不含明文）；冷缓存时解包后能解密；删除 `user_keys` 并清缓存后抛出 `UserKeyNotFoundError`；缓存命中时 KMS 只被调用一次。
- **整体**：集成测试共 19 条，全部通过；`pnpm verify`、`knip` 都通过。
- **下一步**：P2-SRV-05（认证：邮箱验证码、Sign in with Apple（mock）、令牌签发与轮换）。
