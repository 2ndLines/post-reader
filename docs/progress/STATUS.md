# 项目进度

最后更新：2026-11-26（P0-REPO-03 实现完成，PR 待审阅）

## 当前阶段
P0 工程基座 · P0-REPO-01 已实现（PR 待审阅）；合规确认与供应商选型并行等待中。

## 已完成（最近 10 项）
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
- 其余 3 张 P0 任务卡：下一张 P0-REPO-02

## 阻塞
- 国内备案与登记需基于选定的国内模型与语音厂商（供应商未定）
- 海外模型与 TTS 零留存（ZDR）合同未申请

## 待负责人决策
- [ ] 助手推送与提 PR 的身份（机器用户或 GitHub App），之后开启 `main` 规则集（docs/progress/github-settings.md）
- [ ] 合规负责人：U21 水印与元数据格式；U4 仅音频提示作显式标识；U7 国内实名；U26 18+ 分级与不提供未成年人模式
- [ ] 供应商：国内、海外的文本生成、翻译、语音合成各选定主备
- [ ] 《商业化精算与配额配置表》：各档位目标「成本 ÷ 点数」（费率系数标定的输入，ADR 0016）
- [ ] D14：以上确认后，主 PRD v2.7 定稿

## 下一步建议
1. P0 工程基座：P0-CI-01 → P0-REPO-03 → P0-REPO-02 → P0-REPO-04；P0-REPO-05 可并行
2. P1 契约与规格：`canonical-spec` 黄金向量、`contracts`（含跳章 WS 消息）；`packages/signed-url` 属 LT-01（P2–P3）
3. 风险原型：iOS 切片播放与跳章、WebKit 登录凭证、AudioSeal 水印开销、首段延迟（真实厂商），在 P1–P4 首个任务中安排
