# 任务卡索引

任务卡模板见 `docs/archs/ai-dev-playbook.md` 附录 B，编号规则见 §5.2。「上下文摘要」「计划」「风险与问题」「交接记录」四节由助手在开工时填写；验收标准由负责人确认后不得自行修改。

## P0 · 工程基座

出口条件（playbook §6.2）：空项目上 `pnpm verify` 与 CI 全绿；向 `main` 直接推送被拒绝；受保护路径改动会自动请求负责人审阅。

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P0-REPO-01](P0-REPO-01.md) | Monorepo 骨架与工具链锁定 | — | — | 已合并（2026-11-27） |
| [P0-REPO-02](P0-REPO-02.md) | 规则文件与文档导入收尾 | REPO-01 | 审阅各端 AGENTS.md | 已合并（2026-11-27）；AC3 待负责人 |
| [P0-CI-01](P0-CI-01.md) | `ci` 工作流与分支保护 | REPO-01 | 在 GitHub 开启分支保护 | 已合并（2026-11-27）；AC4 待负责人 |
| [P0-REPO-03](P0-REPO-03.md) | 本地钩子、CODEOWNERS、PR 模板 | REPO-01、CI-01 | — | 已合并（2026-11-27）；AC2 待负责人 |
| [P0-REPO-04](P0-REPO-04.md) | 助手工具配置（权限、钩子、skills、子代理、MCP） | REPO-02 | 审阅全部 `.claude/`；配置只读 PAT | 已合并（2026-11-27）；AC4 已在会话中实测（见任务卡） |
| [P0-REPO-05](P0-REPO-05.md) | 本地容器环境与验证项 V1、V4、V5 | REPO-01 | V5 需两区云账号只读查询 | 已合并（2026-11-27）；V5 API 复核待负责人 |

建议顺序：REPO-01 → CI-01 → REPO-03 → REPO-02 → REPO-04；REPO-05 在 REPO-01 之后即可并行。

## P1 · 契约与规格

出口条件（playbook §6.3）：TS 与 Swift 两侧黄金向量 100% 通过；`openapi.yaml` 可生成 Swift 客户端并编译。人工检查点：清洗规则、摘要算法、SSML 转义位置（D3）确认后冻结 `schemaVersion = 1`。

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P1-SPEC-01](P1-SPEC-01.md) | `canonical-spec`：SPEC.md、TS 参考实现、黄金向量 | P0 | 确认 Q1–Q7，冻结 schemaVersion | 已合并（2026-11-27） |
| [P1-IOS-01](P1-IOS-01.md) | `ReaderCore`：Swift 清洗与摘要，读取同一组向量 | SPEC-01 | — | 已合并（2026-11-27） |
| [P1-CTR-01](P1-CTR-01.md) | `contracts`：基础枚举、`CanonicalPost`、错误码、problem+json | SPEC-01 | 确认 Q1（400 与 422） | 已合并（2026-11-27） |
| [P1-CTR-02](P1-CTR-02.md) | 公共 API 契约、`openapi.yaml` 生成与 Swift 客户端（V3） | CTR-01、CTR-03 | 确认 Q1–Q3（响应结构、请求头） | 已合并（2026-11-27） |
| [P1-CTR-04](P1-CTR-04.md) | `config-schema` 与 `config/` 初始文件（未标定参数显式标记） | CTR-01 | 提供 10 项标定值；确认 Q1–Q3 | 已合并（2026-11-27） |
| [P1-CTR-03](P1-CTR-03.md) | WebSocket 消息类型与兼容性测试 | CTR-01 | 确认 Q1（降级原因取值） | 已合并（2026-11-27） |

## P2 · 后端基础

出口条件（playbook §6.4）：集成测试覆盖登录、刷新、吊销、签名、重放与频控；日志脱敏测试通过。**P1 阶段评审延后由负责人进行（负责人以 `/goal` 要求自行推进）。**

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P2-SRV-01](P2-SRV-01.md) | `platform`：env、日志脱敏、OTel、Fastify 工厂、problem+json、健康检查 | P1 | 确认 Q1–Q3（两处偏离 05，readyz 错误码） | 已合并（2026-11-27） |
| [P2-SRV-02](P2-SRV-02.md) | `platform/db` 与身份相关的 5 张表、集成测试、迁移不可变检查 | SRV-01 | Q2：是否接受 Testcontainers 依赖树中的 BlueOak 许可证 | 已合并（2026-11-27） |
| [P2-SRV-03](P2-SRV-03.md) | `platform/redis`：令牌桶 Lua、nonce、R_daily、会话吊销、验证码冷却 | SRV-01 | Q1（超限时计数是否回退） | 已合并（2026-11-27） |
| [P2-SRV-04](P2-SRV-04.md) | `platform/kms` 与字段加密（本地文件密钥模拟 KMS） | SRV-02 | Q1（AAD 绑定规则）、Q2（版本字节） | 已合并（2026-11-27） |
| [P2-SRV-05](P2-SRV-05.md) | `auth`：邮箱验证码、Sign in with Apple、令牌签发与轮换、吊销 | SRV-02–04 | Q1–Q4（并发刷新、计费时区、账号关联） | 已合并（2026-11-27） |
| [P2-SRV-06](P2-SRV-06.md) | 请求签名中间件与重放测试（与 iOS 共用的黄金向量） | SRV-05 | Q1（规范化查询串）、Q2（时间窗的错误码） | 已合并（2026-11-27） |
| [P2-SRV-07](P2-SRV-07.md) | App Attest：证明登记、断言校验，`/auth/refresh` 要求设备证明 | SRV-05 | Q1（合成测试数据）、Q2（clientData 格式） | 已合并（2026-11-27） |
| [P2-SRV-08](P2-SRV-08.md) | 厂商 Mock 服务：回放、录制（需授权）、延迟 / 错误 / 挂起 / 断开注入 | SRV-01 | Q1（是否进 compose）、Q2（02 §15 的目录位置） | 已合并（2026-11-27） |
| [P2-SRV-09](P2-SRV-09.md) | 频控挂载：认证接口的 IP 令牌桶、`/auth/refresh` 的用户令牌桶（补齐 P2 出口条件） | SRV-03、SRV-05 | Q1（非生产环境的未标定桶）、Q2（trustProxy）、Q3（`Retry-After`） | PR 待审阅 |

## P3 · 同语种流水线、海外预发、台架雏形

出口条件（playbook §6.5）：在 `intl-staging` 用台架跑通同语种样本，送入 TTS 的文本摘要与客户端摘要一致率 100%；服务端 TTFA 已记录；`smoke` 套件可在部署后自动运行。`intl-staging` 与真实厂商需要负责人提供云账号与厂商密钥；不依赖外部账号的卡先行。

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P3-SRV-01](P3-SRV-01.md) | `jobs`：表、状态机、`POST /jobs`（摘要重算、幂等、预检）、查询与取消、事件流 | SRV-05–09 | Q1–Q7（幂等键规则、状态码等默认值） | PR 待审阅 |
| [P3-SRV-02](P3-SRV-02.md) | WebSocket 网关：`hello` 鉴权、订阅与 `resume`、上行写入、背压、停机前 `reconnect` | SRV-01（P3） | Q1（`hello` 签名串）、Q2（关闭码）、R2（事件流保留窗口） | PR 待审阅 |
| [P3-SRV-04](P3-SRV-04.md) | `quota`：两层计量、`settleCall` 原子核销、退还、软着陆 | SRV-01（P3） | Q1（容错等价用量由调用方提供）、Q2（无账期时拒绝结算）；系数与单价待标定 | PR 待审阅 |
| [P3-PIPE-02](P3-PIPE-02.md) | 分支 A 第一部分：音色分配、`select` 校验与降级、TTS 输入规范化与切句（纯函数） | — | Q1（音色约束改为整篇检查）；第二部分等 LLM 厂商与语种识别库 | 第一部分 PR 待审阅 |

## P4 · iOS 基座（可与 P2、P3 并行）

出口条件（playbook §6.6）：模拟器上可登录并播放样帖；快照测试覆盖全部已实现组件的深浅色与 3 档字体。人工检查点：负责人对照冻结原型确认视觉与交互。

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P4-IOS-01](P4-IOS-01.md) | XcodeGen 工程、SPM 包骨架、xcconfig、能力、SwiftLint / SwiftFormat、`make`、Xcode Cloud 脚本 | P1-IOS-01 | Q1（Bundle ID、Team ID、D1）、Q2（lint 不在构建阶段）、Q3（iOS 18 模拟器）；Xcode Cloud 工作流需 Apple 账号 | PR 待审阅 |

## 之后

P1 契约与规格（`canonical-spec` 黄金向量、`contracts` 含跳章 WS 消息）见 playbook §6.3；`packages/signed-url` 属 LT-01（P2–P3）。风险原型（iOS 切片拼接与跳章、WebKit 凭证、AudioSeal 开销、真实厂商首段延迟）按 §5.1「风险前置」在 P1–P4 各自首个任务中安排，届时另开任务卡。
