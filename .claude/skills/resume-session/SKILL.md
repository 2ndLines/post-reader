---
name: resume-session
description: 接续中断的会话或新开会话时使用：从 STATUS.md、任务卡交接记录与最近的 PR 恢复上下文，不依赖对话记忆。
---

# resume-session：接续会话

依据：docs/archs/ai-dev-playbook.md §4.1–§4.2；docs/progress/HANDOFF.md §8。

## 步骤
1. 读根 `AGENTS.md`、`docs/progress/STATUS.md`（当前阶段、进行中、阻塞、负责人待办）与 `docs/tasks/README.md`（各卡状态）。
2. 对「进行中」的每张卡，读它的「交接记录」，确定最后完成的验收项与剩余事项。
3. 查看分支与 PR 状态：`git branch -a`、`gh pr list --state open`、`gh pr checks <编号>`。CI 失败时先读日志找根因（§3.1 第 9 步），不靠重跑碰运气。
4. 核对工作区：`git status`，以及本地是否有未提交或未推送的改动；有的话先弄清来源，不要直接丢弃。
5. 用 5 行以内的文字总结：当前在做哪张卡、做到哪一步、下一步是什么、有什么在等负责人。
6. 继续时沿用该卡的分支与计划；需要偏离计划时，先更新任务卡的「计划」。

## 完成时必须产出
- 恢复后的进度摘要（当前卡、下一步、阻塞项）
- 如果发现 STATUS.md 与实际状态不一致，同一会话内修正
