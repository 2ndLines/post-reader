# P0-REPO-02 规则文件与文档导入收尾

## 目标
让每个端都有自己的 AGENTS.md，根规则与实际目录、命令一致。

## 依据
- 手册：playbook §2.2、附录 A；§4.2–§4.4（进度文件、ADR、文档同步）
- 架构：05 §6.1

## 已完成（2026-11-26，设计阶段导入）
- 根 `AGENTS.md`、`CLAUDE.md`、`README.md`
- `docs/prds/`、`docs/archs/`（含《技术选型分析》《完整技术架构》导出）、`docs/adr/` 0001–0016
- `docs/progress/STATUS.md`、`HANDOFF.md`

## 交付物
- `apps/ios/AGENTS.md`、`apps/server/AGENTS.md`、`apps/admin-web/AGENTS.md`、`apps/testbench/AGENTS.md`、`apps/edge/AGENTS.md` 初稿：各端命令、目录约定、该端红线与受保护路径（摘自架构 01–04、02 §22.1 与 playbook §8、§9.4），每份不超过 60 行
- 根 `AGENTS.md` 的「命令」一节与 P0-REPO-01 实际脚本对齐：尚不存在的命令标注所属阶段，不写成可用
- 核对 `docs/` 内相对路径链接全部可达（脚本检查，入 `pnpm verify` 或 CI）

## 验收标准
1. 链接检查脚本对 `docs/`、`AGENTS.md`、`README.md` 报告 0 个失效链接 —— 输出
2. 根 `AGENTS.md` 中列出的每条命令，在当前仓库能运行或明确标注阶段 —— 逐条核对表贴在 PR
3. 各端 AGENTS.md 由负责人审阅通过（AGENTS.md 属受保护路径）

## 范围外
修改 PRD、架构正文与 ADR 结论。

## 上下文摘要（助手填写）

填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 P0-REPO-03 的分支上。

- **内容来源**：各端 AGENTS.md 的素材都已写在架构文档里：01 §21、02 §17、03 §12、04 §12 是各端的 `AGENTS.md` 要点，playbook §8 是各端要点，受保护路径来自 playbook §9.4。
- **edge 的来源**：edge 没有单独的要点一节，内容取自 02 §22.1 与 ADR 0006。
- **根 AGENTS.md 的问题**：「命令」一节目前把还不存在的命令写成可用。
- **文档链接**：仓库内的文档大多用反引号写路径，真正的相对链接不多。

## 计划（助手填写）

- **各端 AGENTS.md**：在 `apps/{ios,server,admin-web,testbench,edge}/AGENTS.md` 各写一份，每份不超过 60 行。内容依次为：命令（标注从哪个阶段起可用）、结构与边界、规则、红线、受保护路径，并给出依据的链接。
- **根 AGENTS.md**：
  - 「命令」一节改成表格，列出「状态」。只有当前确实能运行的命令写为可用，其余标注所属阶段与任务卡。
  - 在「目录」一节补上 `tools/`。
- **链接检查**：在 `tools/ci-checks` 中新增链接检查 `pnpm check:links`，并加入 `ci`。
  - 检查范围：`docs/` 下全部 Markdown、各级 `AGENTS.md` 与 `README.md`。
  - 抽取内联链接、图片链接与引用定义，跳过代码块、行内代码、外部链接和纯锚点，只检查目标文件是否存在。

## 风险与问题（助手填写）

- **R1 AC3 需要负责人审阅**：AGENTS.md 属于受保护路径，CODEOWNERS 中有 `**/AGENTS.md`，各端文件需要负责人审阅通过。
- **R2 链接检查不检查锚点**：标题锚点的生成规则（中文、全角符号）各平台不一致，硬性检查容易误报，所以只检查文件是否存在。需要检查锚点时另开任务。
- **R3 各端 AGENTS.md 中的推导内容**：少数条目不是照抄架构文档的要点，而是由根红线或 05 推导出来的。例如 edge 的「只用 Web 标准 API」（来自 `packages/signed-url` 只用 Web Crypto 的约定），admin 的「图表只用 ECharts、日期只用 dayjs」（来自 05 §2.3）。依据都已在文件中注明。

## 交接记录（会话结束时填写）

**2026-11-26 · AC1、AC2 已完成；AC3 等负责人审阅**

- **AC1**：`pnpm check:links` 输出 `63 个文件，42 个相对链接，失效 0`。
  - 反向验证：在 `tools/README.md` 中临时加入一个失效链接，检查报出 `失效  tools/README.md:5  docs/does-not-exist.md`，退出码 1；删除后退出码 0。
  - 该检查有 13 个单元测试。其中尖括号目标那条，第一版的期望值是照着有缺陷的实现写的，测试失败后同时修正了实现与期望值。
- **AC2**：逐条核对根 AGENTS.md 中的命令：

  | 命令 | 结果 |
  | --- | --- |
  | `pnpm i` | 0 |
  | `pnpm verify` | 0 |
  | `pnpm knip` | 0 |
  | `pnpm check:versions` / `check:pins` / `check:licenses` / `check:codeowners` / `check:links` | 均为 0 |
  | `pnpm dev`、`contracts:gen`、`spec:vectors`、`test:int`、`db:migrate:new`、`testbench` | 均非 0（脚本尚不存在），与「P0-REPO-05 / P1 / P2 / P3 起」的标注一致 |
  | `make -C apps/ios …` | `apps/ios/Makefile` 尚不存在，与「P4-IOS-01 起」的标注一致 |

- **AC3（未完成）**：等待负责人审阅 5 份各端 AGENTS.md（31–39 行）与根 AGENTS.md 的改动。
- **下一步**：P0-REPO-04（助手工具配置）。
