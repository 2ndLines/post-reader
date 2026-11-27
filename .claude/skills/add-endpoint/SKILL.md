---
name: add-endpoint
description: 新增或修改 API 接口时使用：契约 → 生成 → 路由测试 → 实现 → 调用方 → 接口表。
---

# add-endpoint

> 骨架：首次使用阶段为 P2。届时由当阶段的第一张相关任务卡补全本文件（补全本身也走 PR，由负责人审阅，05 §6.4 第 5 条）。

依据：docs/archs/ai-dev-playbook.md §7.1。本文件不复制依据中的步骤，执行时以依据原文为准。

## 步骤（骨架）
1. 读依据中的标准作业程序，按顺序逐步执行。
2. 先写测试或反例样本，并确认它们以预期方式失败（playbook §3.1 第 4 步）。
3. 只改计划内的文件；涉及受保护路径（`.github/CODEOWNERS`）时，在 PR 中标注。
4. 运行 playbook §9.2 中对应改动类型要求的检查。

## 完成时必须产出
- 依据中列出的全部产物，以及对应检查的输出
- PR 描述按 `.github/pull_request_template.md` 填写，自审清单逐条勾选
- 文档同步（playbook §4.4）
