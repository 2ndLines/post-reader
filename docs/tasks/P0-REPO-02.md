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
## 计划（助手填写）
## 风险与问题（助手填写）
## 交接记录（会话结束时填写）
