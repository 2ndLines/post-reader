# 任务卡索引

任务卡模板见 `docs/archs/ai-dev-playbook.md` 附录 B，编号规则见 §5.2。「上下文摘要」「计划」「风险与问题」「交接记录」四节由助手在开工时填写；验收标准由负责人确认后不得自行修改。

## P0 · 工程基座

出口条件（playbook §6.2）：空项目上 `pnpm verify` 与 CI 全绿；向 `main` 直接推送被拒绝；受保护路径改动会自动请求负责人审阅。

| 编号 | 内容 | 依赖 | 需负责人 | 状态 |
| --- | --- | --- | --- | --- |
| [P0-REPO-01](P0-REPO-01.md) | Monorepo 骨架与工具链锁定 | — | — | PR 待审阅 |
| [P0-REPO-02](P0-REPO-02.md) | 规则文件与文档导入收尾 | REPO-01 | 审阅各端 AGENTS.md | 部分完成 |
| [P0-CI-01](P0-CI-01.md) | `ci` 工作流与分支保护 | REPO-01 | 在 GitHub 开启分支保护 | PR 待审阅；AC4 待负责人 |
| [P0-REPO-03](P0-REPO-03.md) | 本地钩子、CODEOWNERS、PR 模板 | REPO-01、CI-01 | — | 待开始 |
| [P0-REPO-04](P0-REPO-04.md) | 助手工具配置（权限、钩子、skills、子代理、MCP） | REPO-02 | 审阅全部 `.claude/`；配置只读 PAT | 待开始 |
| [P0-REPO-05](P0-REPO-05.md) | 本地容器环境与验证项 V1、V4、V5 | REPO-01 | V5 需两区云账号只读查询 | 待开始 |

建议顺序：REPO-01 → CI-01 → REPO-03 → REPO-02 → REPO-04；REPO-05 在 REPO-01 之后即可并行。

## 之后

P1 契约与规格（`canonical-spec` 黄金向量、`contracts` 含跳章 WS 消息）见 playbook §6.3；`packages/signed-url` 属 LT-01（P2–P3）。风险原型（iOS 切片拼接与跳章、WebKit 凭证、AudioSeal 开销、真实厂商首段延迟）按 §5.1「风险前置」在 P1–P4 各自首个任务中安排，届时另开任务卡。
