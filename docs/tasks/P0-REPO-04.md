# P0-REPO-04 助手工具配置

## 目标
助手在本仓库里默认只能做安全的事，常用流程一条命令即可调起，审阅由独立子代理完成。

## 依据
- 架构：05 §6（全部小节）、附录 E（`.claude/settings.json` 与 hooks 脚本）、附录 F（`.mcp.json`）
- 手册：playbook §2.2、§7（标准作业程序）、§9.3、§10

## 交付物
- `.claude/settings.json`：
  - 权限：允许 `pnpm`、`make`、`xcodebuild`、`xcrun simctl`、`docker compose`、`git`（不含 `push --force`）、`gh pr`；拒绝读取 `.env`、`.env.*`，拒绝 `pulumi up/destroy` 生产 stack、`gh pr merge`、递归删除类命令
  - `enabledMcpjsonServers` 只含 `github`
- `.claude/hooks/`：`guard-paths.sh`（硬性拒绝写入的路径）、`format-changed.sh`、`note-protected.sh`、`verify-on-stop.sh`
- `.claude/agents/reviewer.md`（只读，按 §9.3）、`security-reviewer.md`（只读，按 §10）
- `.claude/skills/`：05 §6.4 全部 skill 的 `SKILL.md`；P0 先写完整 `start-task`、`resume-session`、`phase-review`、`add-dependency`，其余 skill 写出步骤骨架并注明首次使用阶段
- `.mcp.json`：`github`（只读 PAT，令牌由负责人本机环境变量提供，不入库）
- `.claude/settings.local.json` 加入 `.gitignore`

## 验收标准
1. 助手尝试读取 `.env` 被拒绝 —— 会话记录
2. 助手尝试写入 `guard-paths.sh` 列出的路径被钩子拒绝并给出提示 —— 会话记录
3. 修改一个 TS 文件后自动格式化；会话结束时 `verify-on-stop.sh` 运行 —— 会话记录
4. `/start-task P0-REPO-05` 能读出任务卡并生成上下文摘要与计划 —— 会话记录
5. 钩子脚本有单元测试（bats 或等价）覆盖允许与拒绝两类输入

## 范围外
`sentry`（P3）、`xcodebuild`（P4）、`playwright`（P9）MCP。

## 需负责人
审阅 `.claude/` 与 `.mcp.json` 全部内容（受保护路径）；创建只读 fine-grained PAT。

## 上下文摘要（助手填写）
## 计划（助手填写）
## 风险与问题（助手填写）
## 交接记录（会话结束时填写）
