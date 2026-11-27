# P0-REPO-03 本地钩子、CODEOWNERS、PR 模板

## 目标
问题在提交前就被拦下；高风险路径的改动必然经过负责人。

## 依据
- 架构：05 §4.1（lefthook 规范）
- 手册：playbook §9.4（受保护路径）、附录 C（PR 模板）

## 交付物
- `lefthook.yml`：提交前运行 Biome（仅暂存文件）、gitleaks（暂存区）、变更包类型检查；推送前运行 `pnpm verify`
- `.github/CODEOWNERS`：playbook §9.4 全部路径指定负责人；另加 `.claude/**`、`.mcp.json`、`lefthook.yml`、`.github/CODEOWNERS` 自身
- `.github/pull_request_template.md`：附录 C 原文
- `pnpm i` 后自动安装钩子（`prepare` 脚本）

## 验收标准
1. 暂存一个格式错误的文件，`git commit` 被拒绝 —— 输出
2. 改动 `config/tiers.yaml` 的 PR 自动请求负责人审阅 —— 截图（分支保护开启「必须 Code Owner 审阅」后）
3. CODEOWNERS 覆盖 §9.4 每一条路径 —— 脚本比对 §9.4 代码块与 CODEOWNERS 输出
4. 钩子耗时：提交前钩子在空改动下小于 5 s —— 计时输出

## 范围外
助手侧钩子（P0-REPO-04）。

## 上下文摘要（助手填写）
## 计划（助手填写）
## 风险与问题（助手填写）
## 交接记录（会话结束时填写）
