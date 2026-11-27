# P1-CTR-04 `packages/config-schema` 与 `config/` 初始文件

## 目标
为 `config/` 中的 `langs.yaml`、`tiers.yaml`、`quotas.yaml`、`flags.yaml` 建立 zod 校验（00 §3.4、§5），填入设计中已有的默认值。PRD 中标为「待标定」的参数**显式标记为未标定**，不编造数值，并让生产环境拒绝加载未标定的配置。

## 依据
- 架构：00 §3.4、§5；02 §9（公共缓存扣点开关）、§11.3（限流）、§18.1（运行时开关）、§21（默认值落点）、§23（单篇上限、计费时区）
- 需求：主 PRD 1.3（未标定参数说明）、5.1（语种等级）、5.2、11.1（档位矩阵）
- 规则：docs 写作规则 §4（不为显得完整而补成未确认的参数）；ADR 0004、0016

## 交付物
- `packages/config-schema`：`calibration.ts`（未标定标记）、`schemas.ts`、`load.ts`；测试；`scripts/check-config.ts`
- `config/langs.yaml`、`tiers.yaml`、`quotas.yaml`、`flags.yaml`
- 根脚本 `pnpm check:config`（加 `--production` 时为生产模式），并加入 `ci`

## 验收标准（助手起草，2026-11-26；负责人确认前视为草案）
1. 4 个配置文件都通过 schema；`langs.yaml` 的 Tier 1、Tier 2 与主 PRD 5.1 一致，由测试解析 PRD 比对 —— 测试输出
2. 未标定的参数都用 `{ uncalibrated: true, source }` 表示，并附依据；写成 0、缺少依据、`uncalibrated: false` 都被拒绝 —— 测试输出
3. `pnpm check:config` 列出全部未标定参数并以 0 退出；`--production` 在存在未标定参数时以 1 退出 —— 输出
4. 业务约束有拒绝用例：`deep` 仅 pro 可用、同一语种不能同时出现在两个等级、下发给客户端的开关必须是布尔值、开关键名格式 —— 测试输出
5. `pnpm verify`、`knip`、CI 全绿

## 范围外
其余配置文件（`credit-rates`、`routing`、`voices`、`privacy`、`compliance` 等，分别在 P2、P3、P10 中随各自的使用方一起引入）；配置包的打包与签名（P9-ADM-05、ADR 0018）；采编策略中各密度档位的入选条数 `N_*`（P3-PIPE-02 的选拔步骤配置）。

## 上下文摘要（助手填写）
填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p1-ctr-02` 上。

- **未标定的参数**：主 PRD 1.3 中 `Q_*`、`R_daily`、`N_*` 都标为「待标定」，没有默认值；令牌桶参数在 02 §11.3 中写为「来自 `quotas.yaml`」，同样没有数值。
- **有默认值的参数**：02 §21 列出了 `quotas.yaml` 中多数键的默认值，§23 给出单篇上限与计费时区冷却期。
- **语种**：主 PRD 5.1 给出 Tier 1、Tier 2 的完整列表。
- **档位矩阵**：主 PRD 11.1 只写了可用的 density（`deep` 仅 pro），没有逐项列出各档位可用的 weights 与 style。

## 计划（助手填写）
- 用 `calibrated(schema)` 表示「已标定的值」或「显式的未标定标记」。
- `listUncalibrated` 递归列出全部未标定值；`assertCalibrated` 供生产环境启动时调用，存在未标定值即拒绝。
- `pnpm check:config` 默认只做校验并列出未标定参数；`--production` 用于发布前检查。
- 配置文件中每个值都在注释里写明来源。

## 风险与问题（助手填写）
- **Q1 各档位可用的 weights 与 style**：PRD 11.1 只写了「基础过滤」「加权开关」「全风格高阶定制」。
  - 默认：pro 全开（「全量 / 全风格」的含义明确）。
  - free、plus 标为未标定，待负责人逐项列出。
- **Q2 开关键名**：`jobs.paused`、`branch.translate.enabled`、`siteRules.disabled`、`quota.chargeSharedCacheHit` 是按 02 §9、§18.1 的描述命名的默认键名，待负责人确认。
- **Q3 `fallbackTargetLang: en-US`**：PRD 只规定「缺省遵循系统区域设置」，系统语言不在 Tier 1/2 中时取什么值是默认，待负责人确认。
- **需要负责人提供的标定值**（`pnpm check:config` 输出的 10 项）：
  - `tiers.yaml`：free、plus 的 `weights` 与 `styles`；free、plus、pro 的 `monthlyPoints`（`Q_*`，《商业化精算与配额配置表》）。
  - `quotas.yaml`：`dailyJobLimit`（`R_daily`），以及 `tokenBuckets.user`、`tokenBuckets.ip`（《风控与反滥用策略规范》）。

## 交接记录（会话结束时填写）
**2026-11-26 · AC1–AC5 已完成；10 项标定值待负责人**
- **AC1**：4 个配置文件都通过 schema；Tier 1、Tier 2 与主 PRD 5.1 一致（测试直接解析 PRD）。
- **AC2**：
  - 写成 0、缺少依据、`uncalibrated: false` 三种情况都被拒绝。
  - `listUncalibrated` 能给出嵌套路径；把未标定值全部填上之后，`assertCalibrated` 通过。
- **AC3**：
  - 默认模式输出 `4 个文件，失败 0，未标定参数 10`，退出码 0。
  - `--production` 模式退出码 1。
- **AC4**：`config.test.ts` 共 18 条，覆盖 `deep` 仅 pro、语种等级、开关取值、键名格式。
- **测试发现的缺陷**：YAML 语法错误原本直接从 `parse()` 抛出，错误信息中不带文件名，与加载器的约定不符。已改为统一抛出带 `config/<文件名>` 的错误。
- **AC5**：`pnpm verify`、`knip`、全部 `check:*` 与许可证检查（77 个包）都通过。
- **下一步**：负责人提供 10 项标定值，并确认 Q1–Q3；之后运行 `/phase-review P1`。
