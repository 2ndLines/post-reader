# P0-REPO-01 Monorepo 骨架与工具链锁定

## 目标
建立可安装、可校验的空 monorepo：`pnpm i && pnpm verify` 在干净环境一次通过。

## 依据
- 架构：00 §2（仓库结构）；05 §1.1（版本基线）、§2.3–§2.4（一类一库、版本锁定）、附录 B（`pnpm-workspace.yaml` 安全设置）、§4.1（工具链与共享包）、§5.1（mise）、§5.2（编辑器）
- 手册：playbook §6.2、§9.2

## 交付物
- `pnpm-workspace.yaml`（`apps/*`、`packages/*`、`tools/*`）；根 `package.json`：`packageManager` 固定 pnpm 补丁版本，`engines.node` 为 26
- `.mise.toml`：node 26、pnpm、gitleaks、gh 固定版本；`.nvmrc`；`.xcode-version`（Xcode 27 小版本）
- `turbo.json`：`lint`、`typecheck`、`test`、`build` 管线；只用本地缓存
- `biome.json`：格式化与 lint 规则集中于根
- `packages/tooling`：共享 `tsconfig`（`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）、共享 vitest 配置（v8 覆盖率）
- 根脚本：`pnpm verify` = Biome + 类型检查 + 单元测试；`pnpm knip`
- 空目录占位：00 §2 列出的 `apps/*`、`packages/*`、`config/`、`evals/`、`infra/`、`tools/`（各含 `README.md` 一句话说明，后续阶段填充）；不预建任何业务代码
- `.vscode/extensions.json` 与 `settings.json`（05 §5.2）；`.editorconfig`
- `.gitignore` 补充 `node_modules`、`.turbo`、`coverage`、`.env*`（保留 `env.example`）

## 验收标准
1. 干净克隆后 `mise install && pnpm i && pnpm verify` 退出码 0 —— 命令输出
2. `packages/tooling` 中放一个最小示例包与一个测试，故意写一个类型错误时 `pnpm verify` 失败 —— 两次运行输出
3. `turbo run verify` 第二次运行命中本地缓存；未配置远程缓存 —— 输出与 `turbo.json`
4. 所有新增依赖登记在 05 §4.1，版本固定（无 `^`、`~`）—— 差异
5. `pnpm knip` 无报告

## 范围外
CI 工作流（P0-CI-01）、git 钩子（P0-REPO-03）、Docker（P0-REPO-05）、任何业务包内容。

## 上下文摘要（助手填写）
## 计划（助手填写）
## 风险与问题（助手填写）
## 交接记录（会话结束时填写）
