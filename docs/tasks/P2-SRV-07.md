# P2-SRV-07 App Attest 验证

## 目标
实现 App Attest 的证明登记与断言校验（02 §10.2），并在 `/auth/refresh` 上按契约要求设备证明。

## 依据
- 架构：02 §4.1（第 6 步 `verifyAttest`：`POST /jobs`、`/auth/refresh`）、§4.2（`/attest/challenge`、`/attest/verify`）、§10.2；Apple「Validating apps that connect to your server」
- 依赖：05 §4.2（`cbor-x`：只在 auth 模块；配合 `node:crypto` 校验证书链；属于安全敏感包）
- 手册：playbook §6.4（以样例数据做单元测试）

## 交付物
- `apps/server/src/modules/auth/attest.ts`、`attest-guard.ts`（受保护路径）；`/v1/attest/challenge`、`/v1/attest/verify`；`/v1/auth/refresh` 挂载 `requireAttest`
- 测试夹具 `attest-fixture.ts`（openssl 合成证书链）；单元测试与集成测试
- 契约：仅要求 Attest 的接口也带 `X-Ts`（重新生成 `openapi.yaml`）

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 证明的每一项校验都有拒绝用例，并落在预期的那一步：CBOR、fmt、证书链（含攻击者自建的根）、有效期、nonce、keyId、rpId、counter、aaguid（区分生产与开发） —— 单元测试
2. 断言：签名、rpId、counter 必须递增；请求内容被改动时签名不符 —— 单元测试
3. 全流程：登记 → 用断言刷新成功；断言重放、挑战重用、伪造挑战、缺少断言头、未知 keyId、超出时间窗、用自己设备的断言刷新别人的会话，都被拒绝 —— 集成测试
4. 生产环境不能关闭校验 —— 测试
5. `pnpm verify`、`knip`、`ci` 与 `integration` 工作流全绿

## 范围外
固定 Apple App Attest 根证书的正式文件与指纹校验、生产的 Team ID 与 Bundle ID（需要 Apple 账号，P4、P5）；`POST /jobs` 挂载（P3-SRV-01）；回执（receipt）的风险评估（P8 及以后）；验证失败时设置 `devices.risk_flag`（后台风控，P9）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p2-srv-06` 上。

- 02 §10.2 要求验证证书链、`rpIdHash = SHA256(teamId.bundleId)`、`counter = 0`、challenge；断言要验证签名、`counter` 单调递增，并给出 `clientDataHash = SHA256(method | path | bodySha256 | ts)`。
- 05 规定使用 `cbor-x` 配合 `node:crypto`。
- Apple 没有公开可直接使用的完整样例证明对象。

## 计划（助手填写）
- **证明与断言的校验**：严格按 Apple 文档的步骤逐步实现。用最小的 DER 解析器读取叶证书的 nonce 扩展（Node 的 `X509Certificate` 不提供任意扩展）。
- **测试夹具**：用 openssl 合成与 App Attest 结构相同的证书链，覆盖全部分支。
- **counter**：用条件 UPDATE 推进，保证并发下单调递增。
- **放行开关**：只允许开发环境与模拟器使用。

## 风险与问题（助手填写）
- **Q1 测试数据的来源**：playbook 写的是「以 Apple 文档的样例数据做单元测试」。Apple 并没有公开可直接使用的完整证明对象；第三方仓库中的真机数据来源不可控，没有采用。改为用 openssl 合成结构相同的证书链，覆盖全部校验分支。
  - 待 Apple 账号就绪（P4、P5）后，再加一条用真机证明做的回归测试，并固定 Apple 根证书的指纹。
- **Q2 `clientData` 的格式**：按 02 §10.2 实现为 `METHOD|PATH|hex(SHA256(rawBody))|X-Ts`，其中 `|` 为字面字符。iOS 必须逐字一致，待负责人确认。
- **Q3 断言失败的错误码**：都返回 403 `ATTEST_REQUIRED`，`detail` 写明失败的那一步，便于诊断。detail 中不含用户数据。
- **R1 cbor-x 属于安全敏感包**：升级需要负责人审阅（05 §5.5）。它的可选原生加速 `cbor-extract` 的安装脚本已禁用。
- **R2 根证书**：生产必须固定为 Apple App Attest Root CA，并核对其指纹。目前通过配置注入，正式的根证书文件在 Apple 账号阶段加入。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC4 已完成；AC5 见 PR 的 CI**
- **单元测试**：21 条。
  - **证明**：16 种情况（含生产环境的正例）各自落在预期的那一步：nonce、rp-id、key-id、certificate、aaguid、cbor、format、chain、validity、counter 等。
  - **断言**：6 条，覆盖递增、重放、内容被篡改、密钥不对、rpId 不符，以及 clientData 的格式。
- **集成测试**：7 条，全部集成测试共 48 条，都通过。
  - 登记后用 counter=1 刷新成功；再用 counter=1 返回 403 `counter`；用 counter=2 又能成功。
  - 挑战重用与伪造的挑战都返回 `challenge`；证明是为别的挑战生成的，返回 `attestation`。
  - 缺少断言头返回 `headers`，未知的 keyId 返回 `unknown key`，超出时间窗返回 `timestamp`，用自己设备的断言刷新别人的会话返回 `device`。
- **契约**：只要求 Attest 的接口也带 `X-Ts`，`openapi.yaml` 已重新生成。
- **knip**：忽略测试夹具中调用的系统命令 `openssl`。
- **下一步**：P2-SRV-08（厂商 mock 服务）。之后进行 P2 阶段评审：出口条件中「频控」只完成了 Redis 原语，挂到路由上要等参数标定。
