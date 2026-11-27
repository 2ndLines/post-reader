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

填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 P0-CI-01 的分支上。

- **lefthook**：05 §4.1 已登记，状态为「已定」，用于提交前检查：Biome、gitleaks、变更包类型检查。
- **受保护路径**：来自 playbook §9.4 的代码块。其中有 `{a,b}` 花括号写法，CODEOWNERS 不支持，需要逐条展开。
- **PR 模板**：照抄 playbook 附录 C 原文。

## 计划（助手填写）

- **`lefthook.yml`**：
  - 提交前，三项并行：
    - Biome：只检查暂存文件。
    - gitleaks：`git --pre-commit --staged`。
    - 类型检查：只跑有未提交改动的包，用 `turbo --filter='...[HEAD]'` 筛选。
  - 推送前：`pnpm verify`。
  - 所有工具都经 `mise exec` 运行。
- **钩子安装**：由根目录的 `prepare: lefthook install` 负责。lefthook 的 `postinstall` 在 `allowBuilds` 中显式设为 `false`，因为它会悄悄改写 `.git/hooks`，而 pnpm 12 默认把未审阅的安装脚本视为错误。CI 中设置 `LEFTHOOK=0`。
- **`.github/CODEOWNERS`**：
  - §9.4 展开后 27 条，加上任务卡追加的 4 条（`.claude/**`、`.mcp.json`、`lefthook.yml`、`.github/CODEOWNERS`），另加 `**/AGENTS.md`（各端的 AGENTS.md 同样受保护，见 P0-REPO-02）。
  - 所有路径都从根目录写起。
- **`tools/ci-checks` 新增 CODEOWNERS 覆盖检查**：从 playbook 解析 §9.4 的代码块，展开花括号后与 CODEOWNERS 比对。命令为 `pnpm check:codeowners`，并接入 `ci`。
- **`.github/pull_request_template.md`**：附录 C 原文。

## 风险与问题（助手填写）

- **R1 AC2 依赖分支保护**：AC2 要求开启「必须 Code Owner 审阅」，但这又受制于 P0-CI-01 的 R2：助手用的是负责人的凭证，PR 作者就是负责人本人，无法自己批准。负责人决定助手的推送身份之前，AC2 无法验证。
- **R2 lefthook 2 的跳过规则**：lefthook 2 计算出的「推送文件」为空时会跳过 pre-push 任务，首次推送新分支时就会这样。因此给 verify 显式设置了 `files: git ls-files`，并已实测首次推送新分支时 verify 会运行。
- **R3 依赖 mise**：钩子依赖 mise（项目工具链的约定）。没有安装 mise 的环境，钩子会直接报错，不会被静默跳过。

## 交接记录（会话结束时填写）

**2026-11-26 · AC1、AC3、AC4 已完成；AC2 等负责人开启规则集**

验证在从本分支克隆的干净副本中进行：
- **钩子安装**：`pnpm i --frozen-lockfile` 时 prepare 输出 `sync hooks: ✔️(pre-commit, pre-push)`，`.git/hooks` 中有 `pre-commit` 与 `pre-push` 两个钩子。
- **AC1**：暂存格式错误的 `bad-format.ts` 后执行 `git commit`，退出码 1，输出 `🥊 biome … bad-format.ts format … Formatter would have printed the following content`。
- **gitleaks 钩子**（补充验证）：暂存假密钥样例后执行 `git commit`，退出码 1，输出 `leaks found: 1`、`🥊 gitleaks`。
- **AC3**：`pnpm check:codeowners` 输出 `要求 31 条，缺失 0 条`。该检查有单元测试，覆盖花括号展开、§9.4 缺失时报错、未锚定的规则不算覆盖、同一路径以最后一条规则为准。
- **AC4**：没有暂存任何改动时，连续 3 次运行 `lefthook run pre-commit`，`real` 均为 0.12 s。另外，提交本卡改动时三项检查合计用时 0.27 s。
- **pre-push**：
  - 推送到本地裸仓库，以及首次推送一个新分支，都会运行 `turbo run verify`（5 个任务全部成功）。
  - 曾发现首次推送新分支时 verify 被跳过，已修复（见 R2）。
- **过程中的失误**：
  - 第一轮钩子测试是在工作区里做的，事先用 `git stash -u` 把还没提交的 `lefthook.yml` 一并收了起来，导致钩子没有配置可用，两个本应被拒绝的测试提交进入了本地分支。
  - 这两个提交未推送，已用 `git reset --mixed` 移除；其中的「密钥」是随机生成的假值。
  - 之后的验证都改在干净克隆中进行。
- **AC2（未完成）**：需要负责人先按 `docs/progress/github-settings.md` 决定助手的推送身份，开启规则集并勾选「Require review from Code Owners」，再提交一个改动 `config/tiers.yaml` 的 PR 并截图。
- **下一步**：P0-REPO-02（各端 AGENTS.md 与链接检查）。

