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

填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 P0-REPO-05 的分支上，分支名按 playbook 约定改为 `feat/p0-repo-04`。

- **设计依据**：05 §6 与附录 E、F。附录是设计时写的，动手前先用当前 Claude Code 文档核对了几项契约：
  - hook 的 stdin JSON 带有 `tool_input`。
  - 退出码 2 的含义：在 PreToolUse 中阻止工具运行；在 PostToolUse 中只把 stderr 交给助手；在 Stop 中阻止结束。其他退出码一律为非阻断。
  - hook 中可以使用 `$CLAUDE_PROJECT_DIR`。
  - `Bash(x *)` 与 `Bash(x:*)` 等价；规则求值顺序为 deny → ask → allow。
  - skill 用 `disable-model-invocation` 禁止自动调用；子代理用 `tools` 字段限定工具。
- **关键事实**：`permissions` 与 `hooks` 的改动会热加载，对本会话立即生效；新增的 skills 要到新会话才可调用。
- **仓库原状**：没有 `.claude/`，也没有 `.mcp.json`。本机有 `/usr/bin/jq`。

## 计划（助手填写）

- **`.claude/hooks/`**：
  - `guard-paths.sh`：硬性拒绝写入的路径；失败即关闭。
  - `format-changed.sh`：用 Biome 格式化；`.swift` 文件在装有 swiftformat 时才处理。
  - `note-protected.sh`：受保护路径以 CODEOWNERS 为唯一来源，另加 `config/**`。
  - `verify-on-stop.sh`：只检查有改动的包；遵守 `stop_hook_active`。
  - `lib.sh`：公共函数。
- **测试（AC5）**：用 vitest 驱动这些脚本，测试放在 `tools/ci-checks/src/claude-hooks.test.ts`，不另引入 bats。
- **`.claude/agents/`**：`reviewer`（按 §9.3 审阅）与 `security-reviewer`（按 §10 审阅），工具只给 Read、Grep、Glob、Bash，并在说明中限定 Bash 只能运行只读命令。
- **`.claude/skills/`**：按 05 §6.4 共 18 个。`start-task`、`resume-session`、`phase-review`、`add-dependency` 写完整，其余写骨架，注明依据的 playbook §7 小节与首次使用阶段。`phase-review`、`release-checklist` 禁止自动调用。
- **`.mcp.json`**：只配置 `github`，令牌取自环境变量 `${GITHUB_MCP_TOKEN}`，文件中没有密钥值。
- **`.claude/settings.json`**：按 05 §6.8 与附录 E 写，最后才写入，因为写入后立即生效。
- **`.gitignore`**：加入 `.claude/settings.local.json` 与 `.claude/state/`。

## 风险与问题（助手填写）

- **R1 写入配置会改变本会话自身的权限**：allow 规则只按 05 §6.8 与附录 E 的范围写，没有额外扩大；deny 与 ask 规则也在本会话中立即生效（例如 `rm -rf` 被拒）。请负责人审阅 `.claude/settings.json`（受保护路径）。
- **R2 护栏只拦截文件工具**：`guard-paths.sh` 不拦截 shell 命令，`settings.json` 本身就是经 Bash 里的 Biome 格式化的。对受保护文件的强制约束来自 CODEOWNERS 加规则集，见 05 §6.6 实现约束第 4 条。
- **R3 AC4 与 Stop hook 需要新会话验证**：skills 要到新会话才可调用，所以 AC4 需要负责人在新会话中执行 `/start-task P0-REPO-05`。Stop hook 的逻辑由单元测试覆盖。
- **R4 只读 PAT**：`.mcp.json` 依赖负责人创建 fine-grained 只读 PAT，并在本机设置 `GITHUB_MCP_TOKEN`。
- **R5 前几张卡的分支名**：P0-REPO-01 至 P0-REPO-05 的分支没有按 `feat/<编号>` 约定命名，但都已推送并挂在 PR 上，改名会破坏 PR，所以保持原样。从本卡起按约定命名。

## 交接记录（会话结束时填写）

**2026-11-26 · AC1、AC2、AC3（格式化部分）、AC5 已完成；AC4 与 Stop hook 的实际运行待负责人在新会话中验证**

- **AC1**（本会话实测）：用 Read 读取 `.env` 被拒，返回 `File is in a directory that is denied by your permission settings.`
- **AC2**（本会话实测）：
  - **第一次没有拦住**：在 `.claude/hooks/` 下写入的探测文件被创建了。原因是提示文案 `"…：$rel。"` 在 zh_CN.UTF-8 下被 bash 解析成变量 `rel。`，在 `set -u` 下脚本以退出码 1 结束，而 Claude Code 把 1 当作非阻断错误，写入照常进行（失败即放行）。
  - **修复**：所有变量统一写成 `${name}`；增加退出码兜底，内部错误一律改为 2；`lib.sh` 加载失败时同样拒绝。测试改为默认在 UTF-8 locale 下运行，补了这一缺陷的回归用例。探测文件已删除。
  - **复测**：写入被拦住，返回 `PreToolUse:Write hook error: … 拒绝写入受保护文件：.claude/hooks/probe-ac2.sh。此类文件只能由负责人修改…`。
- **AC3**：
  - **自动格式化**（本会话实测）：编辑 TS 测试文件后，harness 提示 `PostToolUse hook modified … (likely a formatter)`。
  - **受保护路径记录**（本会话实测）：`note-protected` 把前面那次探测写入记录到了 `.claude/state/protected-touched.txt`。
  - **会话结束时的 verify-on-stop**：逻辑由单元测试覆盖（`stop_hook_active` 时放行、没有改动时跳过、检查通过时放行、检查失败时以退出码 2 阻止结束）。
- **AC4（未完成）**：本会话调用 `start-task` 返回 `Unknown skill`，因为 skills 不热加载。需要负责人在新会话中执行 `/start-task P0-REPO-05`。
- **AC5**：`claude-hooks.test.ts` 共 41 个用例，覆盖四个脚本的允许与拒绝两类输入，以及以下边界：`..`、项目外路径、NotebookEdit、无法解析的输入、缺少 jq、缺少 lib.sh、UTF-8 与 C 两种 locale。
- **额外核对**：权限规则也是实时生效的，`rm -rf <不存在的路径>` 被拒绝。
- **根目录检查**：`pnpm verify`、`knip` 与全部 `check:*` 都通过。
- **下一步**：P0 的代码部分已全部完成，剩余事项见 STATUS.md「负责人待办」。P1 从 P1-SPEC-01 开始。
