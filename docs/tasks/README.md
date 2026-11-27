# 任务卡索引

任务卡模板见 `docs/archs/ai-dev-playbook.md` 附录 B，编号规则见 §5.2。「上下文摘要」「计划」「风险与问题」「交接记录」四节由助手在开工时填写；验收标准由负责人确认后不得自行修改。

## P0 · 工程基座

出口条件（playbook §6.2）：空项目上 `pnpm verify` 与 CI 全绿；向 `main` 直接推送被拒绝；受保护路径改动会自动请求负责人审阅。

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P0-REPO-01](P0-REPO-01.md) | Monorepo 骨架与工具链锁定 | — | — | PR 待审阅 |
| [P0-REPO-02](P0-REPO-02.md) | 规则文件与文档导入收尾 | REPO-01 | 审阅各端 AGENTS.md | PR 待审阅；AC3 待负责人 |
| [P0-CI-01](P0-CI-01.md) | `ci` 工作流与分支保护 | REPO-01 | 在 GitHub 开启分支保护 | PR 待审阅；AC4 待负责人 |
| [P0-REPO-03](P0-REPO-03.md) | 本地钩子、CODEOWNERS、PR 模板 | REPO-01、CI-01 | — | PR 待审阅；AC2 待负责人 |
| [P0-REPO-04](P0-REPO-04.md) | 助手工具配置（权限、钩子、skills、子代理、MCP） | REPO-02 | 审阅全部 `.claude/`；配置只读 PAT | PR 待审阅；AC4 待新会话 |
| [P0-REPO-05](P0-REPO-05.md) | 本地容器环境与验证项 V1、V4、V5 | REPO-01 | V5 需两区云账号只读查询 | PR 待审阅；V5 API 复核待负责人 |

建议顺序：REPO-01 → CI-01 → REPO-03 → REPO-02 → REPO-04；REPO-05 在 REPO-01 之后即可并行。

## P1 · 契约与规格

出口条件（playbook §6.3）：TS 与 Swift 两侧黄金向量 100% 通过；`openapi.yaml` 可生成 Swift 客户端并编译。人工检查点：清洗规则、摘要算法、SSML 转义位置（D3）确认后冻结 `schemaVersion = 1`。

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P1-SPEC-01](P1-SPEC-01.md) | `canonical-spec`：SPEC.md、TS 参考实现、黄金向量 | P0 | 确认 Q1–Q7，冻结 schemaVersion | PR 待审阅 |
| [P1-IOS-01](P1-IOS-01.md) | `ReaderCore`：Swift 清洗与摘要，读取同一组向量 | SPEC-01 | — | PR 待审阅 |
| [P1-CTR-01](P1-CTR-01.md) | `contracts`：基础枚举、`CanonicalPost`、错误码、problem+json | SPEC-01 | 确认 Q1（400 与 422） | PR 待审阅 |
| [P1-CTR-02](P1-CTR-02.md) | 公共 API 契约、`openapi.yaml` 生成与 Swift 客户端（V3） | CTR-01、CTR-03 | 确认 Q1–Q3（响应结构、请求头） | PR 待审阅 |
| [P1-CTR-04](P1-CTR-04.md) | `config-schema` 与 `config/` 初始文件（未标定参数显式标记） | CTR-01 | 提供 10 项标定值；确认 Q1–Q3 | PR 待审阅 |
| [P1-CTR-03](P1-CTR-03.md) | WebSocket 消息类型与兼容性测试 | CTR-01 | 确认 Q1（降级原因取值） | PR 待审阅 |

## P2 · 后端基础

出口条件（playbook §6.4）：集成测试覆盖登录、刷新、吊销、签名、重放与频控；日志脱敏测试通过。**P1 阶段评审延后由负责人进行（负责人以 `/goal` 要求自行推进）。**

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P2-SRV-01](P2-SRV-01.md) | `platform`：env、日志脱敏、OTel、Fastify 工厂、problem+json、健康检查 | P1 | 确认 Q1–Q3（两处偏离 05，readyz 错误码） | PR 待审阅 |
| [P2-SRV-02](P2-SRV-02.md) | `platform/db` 与身份相关的 5 张表、集成测试、迁移不可变检查 | SRV-01 | Q2：是否接受 Testcontainers 依赖树中的 BlueOak 许可证 | PR 待审阅 |

## 之后

P1 契约与规格（`canonical-spec` 黄金向量、`contracts` 含跳章 WS 消息）见 playbook §6.3；`packages/signed-url` 属 LT-01（P2–P3）。风险原型（iOS 切片拼接与跳章、WebKit 凭证、AudioSeal 开销、真实厂商首段延迟）按 §5.1「风险前置」在 P1–P4 各自首个任务中安排，届时另开任务卡。
