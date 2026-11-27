# 项目进度

最后更新：2026-11-26（P0 全部实现；P1 六张卡全部实现，PR 待审阅）

## 当前阶段
P0 工程基座：6 张卡全部实现，PR 待审阅。P1 契约与规格：6 张卡全部实现。P1 出口条件的两项都已满足：TS 与 Swift 两侧 51 条黄金向量全部通过；`openapi.yaml` 生成的 Swift 客户端能编译（V3）。P1-CTR-04 中有 10 项参数尚未标定（`pnpm check:config` 会逐项列出），需负责人提供；在此之前生产模式拒绝加载。合规确认与供应商选型并行等待中。

## 已完成（最近 10 项）
- P1-CTR-04：`packages/config-schema`，`config/` 下 langs、tiers、quotas、flags 四个文件；未标定参数显式标记，`pnpm check:config` 已接入 CI，`--production` 在仍有未标定参数时拒绝
- P1-CTR-02：02 §4.2 的 20 个接口全部生成为 OpenAPI 3.1（与接口表自动比对），`pnpm contracts:check` 已接入 CI；V3 已验证（Swift 客户端在 macOS 与 iOS 模拟器上编译并通过测试）；新增 `contracts` 工作流
- P1-CTR-03：WebSocket 上行与下行消息契约（与 00 §3.1 自动比对），兼容规则测试（未知 `t` 忽略、多出的字段丢弃、`protocol` 校验）
- P1-CTR-01：`packages/contracts` 的基础枚举（与 00 §3.1 表格自动比对）、`CanonicalPost`、`ErrorCode`、problem+json
- P1-IOS-01：`apps/ios/Packages/ReaderCore`（Swift 6，只依赖 Foundation 与 CryptoKit），51 条向量在 macOS 宿主机与 iOS 27.2 模拟器上全部通过
- P1-SPEC-01：`packages/canonical-spec` 的 SPEC.md（草案）、TS 参考实现、7 类 51 条黄金向量（摘要由独立的 Python 实现计算）
- P0-REPO-04：`.claude/` 权限、4 个 hook（失败即关闭，41 个单元测试）、2 个审阅子代理、18 个 skill、`.mcp.json`（只含 github）
- P0-REPO-05：`pnpm dev` 本地容器（四服务健康检查）；V1 5/5、V4 15/15 通过（ADR 0017）；V5：国内区配置包签名改用 ECDSA P-256（ADR 0018）
- P0-REPO-02：5 份各端 AGENTS.md；根 AGENTS.md 的命令表标注阶段；文档链接检查（`pnpm check:links`，并入 ci）
- P0-REPO-03：lefthook 提交前与推送前钩子、CODEOWNERS（覆盖 §9.4 全部 31 条并由 CI 校验）、PR 模板
- P0-CI-01：`ci` 工作流（版本一致性、Action SHA、Biome、类型检查、测试、gitleaks、许可证、audit），AC1–AC3 有运行链接；`tools/ci-checks` 三项检查
- P0-REPO-01：monorepo 骨架（pnpm 12 + turbo + Biome + TS 7 + vitest 5 + knip），mise 锁定工具链；干净克隆中 `pnpm verify` 通过；文档同步：00 v1.3、05 v1.3
- 主 PRD v2.7 草案；iOS / 管理后台 / 测试台架 PRD v1.3；《业务闭环评审》第一至第四轮
- 架构 02–04 v1.2，00、01 v1.3，05 v1.4；ADR 0001–0016
- 统一额度池两层计量；海外美国单区；两区合成标识；全球隐私基线 + 法域策略
- 跳章协议、边缘层（Hono + Workers + R2）、多平台扩展点
- 规格补全：计费时区、单篇上限、18+、可用性与恢复目标、首发店面

## 进行中
- P0-REPO-01 PR 待负责人审阅（含受保护路径 `infra/README.md`、`packages/canonical-spec/README.md` 占位）
- P0-CI-01 PR #2 待审阅（叠在 #1 上）；AC4 需负责人先决定助手推送身份并开启规则集（docs/progress/github-settings.md）
- P0-REPO-03 PR 待审阅（叠在 #2 上）；AC2 需规则集开启「必须 Code Owner 审阅」
- P0-REPO-02 PR 待审阅（叠在 P0-REPO-03 上）；AC3 需负责人审阅各端 AGENTS.md
- P0-REPO-05 PR 待审阅（叠在 P0-REPO-02 上）
- P0-REPO-04 PR 待审阅（叠在 #7 上）

## 阻塞
- 国内备案与登记需基于选定的国内模型与语音厂商（供应商未定）
- 海外模型与 TTS 零留存（ZDR）合同未申请

## 负责人待办（按顺序）
1. 按顺序审阅并合并 P0 的 PR（每个 PR 叠在前一个之上）：#1 REPO-01 → #2 CI-01 → #5 REPO-03 → #6 REPO-02 → #7 REPO-05 → #8 REPO-04 → #9 SPEC-01 → #10 IOS-01 → #11 CTR-01 → #12 CTR-03 → #13 CTR-02 → CTR-04（本轮最后一个 PR）
2. 决定助手推送与提 PR 的身份（机器用户或 GitHub App），然后开启 `main` 规则集（docs/progress/github-settings.md）
3. 补做需要你操作的验收：CI-01 AC4（向 `main` 直推被拒）、REPO-03 AC2（Code Owner 自动请求审阅）、REPO-02 AC3（审阅各端 AGENTS.md）、REPO-05 V5（两区 KMS 只读 API 复核，命令见 ADR 0018）
4. 创建只读的 fine-grained PAT，并在本机设置 `GITHUB_MCP_TOKEN`（`.mcp.json` 中的 github MCP 用）
5. 批准或修改 ADR 0017、0018
6. P1 人工检查点：确认 P1-SPEC-01 的 Q1–Q7（清洗规则的默认解读），之后冻结 `schemaVersion = 1`
7. P3 引入 promptfoo 前：决定其依赖树中 BlueOak、PSF、LGPL（libvips）等许可证的处理（ADR 0017 约束 6）

## 待负责人决策
- [ ] 助手推送与提 PR 的身份（机器用户或 GitHub App），之后开启 `main` 规则集（docs/progress/github-settings.md）
- [ ] 合规负责人：U21 水印与元数据格式；U4 仅音频提示作显式标识；U7 国内实名；U26 18+ 分级与不提供未成年人模式
- [ ] 供应商：国内、海外的文本生成、翻译、语音合成各选定主备
- [ ] 《商业化精算与配额配置表》：各档位目标「成本 ÷ 点数」（费率系数标定的输入，ADR 0016）
- [ ] D14：以上确认后，主 PRD v2.7 定稿

## 下一步建议
1. **P1-CTR-02 已完成**（PR 待审阅）。后续可以把共享枚举改为 `$ref`，让 Swift 侧共用同一个类型（任务卡 R2）。
2. **P1-CTR-04 已实现**（PR 待审阅）。需要负责人提供 10 项标定值：`Q_free`、`Q_plus`、`Q_pro`、`R_daily`、两个令牌桶，以及 free 与 plus 两档的 weights、styles；同时确认任务卡中的 Q1–Q3。
3. **P1 阶段评审**：P1 的代码部分已全部完成，现在可以运行 `/phase-review P1`。需要负责人确认 SPEC-01 的 Q1–Q7（冻结 `schemaVersion = 1`），以及 CTR-01 和 CTR-03 中的问题。
4. **P2 及以后**：按 playbook §6，前一阶段评审通过后才进入下一阶段。之后有两类事项需要负责人：P3 起的云账号与厂商密钥，P4 起的 Apple 账号。
