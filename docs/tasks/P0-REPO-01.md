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

填写于 2026-11-26。负责人已于同日确认计划（Q1–Q7 均按默认）。

- **需求**：本卡只建「空而可校验」的 TS monorepo 骨架。`pnpm verify`（Biome + 类型检查 + 单元测试）在干净克隆中一次通过；类型错误能让它失败；turbo 只用本地缓存；依赖版本精确固定并登记；knip 无报告。不写业务代码，不做 CI、git 钩子、Docker。
- **依据要点**：
  - 00 §2：给出目录树与依赖方向（`packages/*` 不依赖 `apps/*`）。
  - 05 §1.1：Node 26 LTS；pnpm 固定到补丁版本；TS 固定到小版本，开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`；Xcode 27 固定到小版本。
  - 05 §2.3：一类一库，用 Biome、vitest，不用 ESLint、jest。
  - 05 §2.4：CI 用 frozen lockfile；`.nvmrc` 与 mise 版本一致。
  - 05 §2.5：`minimumReleaseAge` 3 天；只允许必要的安装脚本。
  - 05 §2.6：关闭 turbo 遥测。
  - 05 §4.1：P0 工具库为 turbo、biome、typescript、vitest、lefthook、knip、tsx。
  - 05 §5.1、§5.2：mise 管理的工具清单与 VS Code 推荐扩展。
- **已有实现**：仓库目前只有 `docs/`、`AGENTS.md`、`CLAUDE.md`、`README.md`、`.gitignore`，没有任何工程文件。
- **本机环境**（实测）：
  - node 25.9.0，不是 26；pnpm 12.18.0（全局安装）。
  - Xcode 27.2（27B52）；gh 2.103.3；brew 可用；Docker 29.9.3。
  - **没有 mise 和 gitleaks。**
- **候选版本**：取 2026-11-26 查询 npm、nodejs.org 与 GitHub 的结果，并剔除发布不满 3 天的版本。
  - node 26.13.1（LTS，11-10）；pnpm 12.23.0（11-22）。
  - turbo 2.11.13；@biomejs/biome 2.6.8（2.6.9 发布于 11-24，不满 3 天）。
  - typescript 7.0.2（原生移植版，bin 仍为 `tsc`）。
  - vitest 与 @vitest/coverage-v8 都用 5.1.1（5.1.2 发布于 11-25，不满 3 天）。
  - knip 6.48.0；@types/node 26.6.6。
  - gitleaks 8.30.1；gh 2.103.3。
  - 动手当天按同一规则复核一次。

## 计划（助手填写）

**分支**：从 `main` 拉出 `p0-repo-01-monorepo-skeleton`。本地 `main` 有一个未推送的提交 `75538dd`（P0 任务卡），会随这个 PR 一起进入；你也可以先另行合入它（见问题 Q6）。

**新增或修改的文件**（不含锁文件，预计有效改动约 300 行）：

| 文件 | 内容 |
| --- | --- |
| `package.json`（根） | `private`；`packageManager: pnpm@12.23.0`；`engines.node: ">=26 <27"`。脚本：`verify` = `turbo run verify`，`lint` = `biome check .`，`format` = `biome format --write .`，`knip` = `knip`。`devDependencies` 全部写精确版本 |
| `pnpm-workspace.yaml` | 采用 05 附录 B 的 `packages` 列表（见 Q1）。安装脚本用 `allowBuilds` 声明（pnpm 11 起已移除 `onlyBuiltDependencies`，见风险 R3），初始为空，装依赖时确有需要才加，并在 PR 中说明。`minimumReleaseAge: 4320`；`strictPeerDependencies: true` |
| `pnpm-lock.yaml` | 入库 |
| `.mise.toml` | `[tools]`：node 26.13.1、pnpm 12.23.0、gitleaks 8.30.1、gh 2.103.3。`[env]`：`DO_NOT_TRACK=1`、`TURBO_TELEMETRY_DISABLED=1`（05 §2.6；用 mise 的 env 代替 `.envrc`，见 Q5） |
| `.nvmrc` | `26.13.1`，与 `.mise.toml` 保持一致 |
| `.xcode-version` | `27.2` |
| `turbo.json` | 任务：`//#lint`（根级 Biome）、`typecheck`、`test`（outputs `coverage/**`）、`build`（outputs `dist/**`）。`verify` 依赖 `//#lint`、`typecheck`、`test`，本身没有脚本，只起汇总作用。显式写 `remoteCache.enabled: false` |
| `biome.json` | 格式化与 lint 规则集中在这里；忽略 `docs/**/*.bundle`、`coverage`、`.turbo`；子包不覆盖规则 |
| `knip.json` | 声明 workspaces 与各包入口（含测试文件、vitest 与 tsconfig 配置），避免示例包被误报 |
| `packages/tooling/package.json` | `@post-reader/tooling`，`private`。`exports` 共享配置文件；脚本 `typecheck` = `tsc --noEmit`，`test` = `vitest run --coverage` |
| `packages/tooling/tsconfig.base.json` | `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noEmit`，`module`/`moduleResolution` 用 `nodenext`，`target` 用 ES2024 |
| `packages/tooling/vitest.shared.ts` | 共享 vitest 配置（`coverage.provider: 'v8'`），各包 `mergeConfig` 引用 |
| `packages/tooling/tsconfig.json`、`vitest.config.ts` | tooling 自身也使用上述共享配置 |
| `packages/tooling/example/sum.ts`、`sum.test.ts` | 最小示例与测试（AC2）。typecheck 的 include 覆盖 `example/**`，保证类型错误由 `tsc` 报出，而不是被 vitest 剥掉类型后漏过 |
| 占位 `README.md`（各一句话） | `apps/{ios,server,admin-web,edge,testbench}`、`packages/{contracts,canonical-spec,ui,config-schema,signed-url}`、`config/`、`evals/`、`infra/`、`tools/`。这些目录不建 `package.json`，pnpm 与 turbo 不会把它们识别为包。**其中 `packages/canonical-spec/README.md`、`infra/README.md` 位于 playbook §9.4 的受保护路径**，需要你确认后才能写入 |
| `.vscode/extensions.json`、`settings.json` | 05 §5.2 所列扩展；TS、JSON 的默认格式化器设为 Biome |
| `.editorconfig` | UTF-8、LF、两空格缩进；Swift 文件 4 空格 |
| `.gitignore` | 补充 `.turbo`、`coverage`。`node_modules` 与 `.env*` 已在其中；`env.example` 不以点开头，不会被 `.env.*` 误伤 |

**文档同步**（同一 PR，均不在受保护路径）：
- 05 §4.1：补 `@vitest/coverage-v8`、`@types/node` 两行（见 Q3）。
- 05 附录 B：`onlyBuiltDependencies` 改为 `allowBuilds`。
- 05 §1.1、§4.3：`apps/admin` 改为 `apps/admin-web`（见 Q2）。
- 05 §2.6：`.envrc` 改为 `.mise.toml [env]`（见 Q5）。
- 00 §2：目录树中 `docs/architecture/` 改为 `docs/archs/`，补上 `tools/`。
- `docs/tasks/README.md` 与 `docs/progress/STATUS.md`：更新状态。

**测试与验证**（对应验收标准；输出全部贴进 PR）：
1. **AC1**：在 scratchpad 中从本地仓库 `git clone` 出干净副本，执行 `mise trust && mise install && pnpm i && pnpm verify`，要求退出码为 0。不在工作区里验证。
2. **AC2**：在 `sum.ts` 里临时写一个类型错误，`pnpm verify` 应以非 0 退出并显示 `tsc` 报错；然后还原，再跑一次通过。该错误不提交。
3. **AC3**：连续执行两次 `turbo run verify`，第二次应显示全部命中缓存（`FULL TURBO`），并附上 `turbo.json` 中的 `remoteCache` 设置。
4. **AC4**：`grep` 所有 `package.json`，确认没有 `^` 或 `~`；附 05 §4.1 的差异。
5. **AC5**：`pnpm knip` 无输出。
6. 自审按 playbook §9.3 逐条核对；因为改动涉及受保护路径，PR 会请求你审阅。

**开工前需要你同意的环境操作**：
- 用 `brew install mise` 安装 mise。不用 `curl | sh`，playbook §10.5 禁止这种方式。
- gitleaks、node 26 与 pnpm 由 mise 安装。
- 我执行命令时用 `mise exec --`，不改你的 `~/.zshrc`；shell 激活由你决定是否配置。

## 风险与问题（助手填写）

**风险**
- **R1 TypeScript 7.0.2 是原生移植版。**
  - 已确认：bin 仍是 `tsc`；knip 6 用 oxc 解析，不依赖 TS 的 JS API。
  - 未确认：其余兼容性要到安装后实测。若 `tsc --noEmit` 或 vitest 与它不兼容，回退到 TS 6.0.3，并在 PR 与 05 §1.1 说明。
- **R2 mise 对 `.mise.toml` 的信任机制。** 干净克隆后，含 `[env]` 的配置可能要先执行 `mise trust`，否则 `mise install` 会拒绝运行。因此 AC1 实际执行 `mise trust && mise install && …`，我会在 PR 中注明这一步。
- **R3 pnpm 12 与 05 附录 B 不一致。** pnpm 11 已移除 `onlyBuiltDependencies`，改用 `allowBuilds`（依据：pnpm.io `docs/settings/build.md`）。`strictPeerDependencies` 在 pnpm 12 下是否仍有效，安装时再确认；若已失效，按官方替代项处理并同步附录 B。
- **R4 部分最新版本发布不满 3 天。** 本卡选用的是更早的版本；`minimumReleaseAge` 也会在安装时强制执行这一规则。
- **R5 本机 node 是 25。** 所有命令都经 mise 在 node 26 下运行，不使用全局的 node。

**待你回答的问题**（括号内是不回答时的默认做法）
- **Q1 workspace 列表。** 任务卡写的是 `apps/*`、`packages/*`、`tools/*`；05 附录 B 还多了 `apps/testbench/*`（台架分为 `web/` 和 `runner/` 两部分）。是否采用 05 的完整列表？（默认：采用）
- **Q2 管理后台目录名。** 00 §2 与 AGENTS.md 用 `apps/admin-web`，05 §1.1、§4.3 用 `apps/admin`。（默认：用 `admin-web`，并修正 05）
- **Q3 两个未登记依赖：`@vitest/coverage-v8`、`@types/node`。** AGENTS.md 要求「新依赖先写 ADR」。可以只在 05 §4.1 登记，归入 vitest、typescript 两行的配套，还是各写一份依赖 ADR？（默认：只登记，不写 ADR）
- **Q4 版本写法。** 05 §2.4 允许 `^`，AC4 要求不带 `^`、`~`。我按更严格的 AC4 执行。05 §2.4 是否同步改为「精确版本」？（默认：同步修改）
- **Q5 关闭遥测的位置。** 用 `.mise.toml [env]` 代替 05 §2.6 提到的 `.envrc`（mise 能替代 direnv，少一个工具）。（默认：用 mise，并同步修改 05 §2.6）
- **Q6 未推送的提交 `75538dd`。** 随本 PR 一起进入，还是你先单独合入？（默认：随本 PR）
- **Q7** 同意用 `brew install mise` 安装 mise，并同意写入上面两个受保护路径下的占位 README 吗？（**这一项必须你明确同意**）

**故意不做的事**：`tsx` 和 `lefthook` 虽然登记在 P0，但分别要等后续任务卡（脚本、P0-REPO-03）才会用到。现在安装会让 knip 报未使用依赖，所以本卡不装。

## 交接记录（会话结束时填写）

**2026-11-26 · 实现完成，待 PR 审阅**

- **负责人决定**：
  - Q1–Q7 全部按默认执行。
  - 关于 node 25，负责人的原话是「用 node 25 也一样」。基线仍保持 26：05 §1.1 与 D9 定的是 26，而 node 25 已于 2026-06-01 停止维护（EOL）。
  - 另外实测：用全局 node 25 运行 `pnpm verify`，同样通过。
- **验收证据**（在干净克隆中运行）：
  - **AC1**：`mise trust && mise install && pnpm i --frozen-lockfile && pnpm verify` 退出码 0。node 为 v26.13.1，pnpm 为 12.23.0；3 个任务全部成功。
  - **AC2**：在 `sum.ts` 中写入类型错误后，`pnpm verify` 退出码 1，报错为 `error TS2322: Type 'string' is not assignable to type 'number'`，失败任务是 `@post-reader/tooling#typecheck`。还原后退出码 0。
  - **AC3**：连续运行两次 `turbo run verify`，第二次显示 `Cached: 3 cached, 3 total`、`FULL TURBO`，并输出 `Remote caching disabled`；`turbo.json` 中设置了 `remoteCache.enabled: false`。
  - **AC4**：所有 `package.json` 中都没有 `^` 或 `~`。05 §4.1 补登记了 `@vitest/coverage-v8`、`@types/node`。
  - **AC5**：`pnpm knip` 无报告。另做了反向验证：临时加一个未使用的导出，knip 能检出。
  - **其他**：gitleaks 扫描通过。
- **与计划的偏差**：
  - **Biome 2.6 默认会格式化 Markdown。** 如果不关，它会改写全部设计文档的表格排版，所以设置了 `markdown.formatter.enabled: false`。另外，Biome 已弃用 `rules.recommended`，改用 `rules.preset: "recommended"`。
  - **依赖放置。** `typescript`、`vitest`、`@vitest/coverage-v8`、`@types/node` 放在使用它们的包里（`packages/tooling`）。根目录只放 turbo、Biome、knip。05 §4.1 中两行的「位置」相应改为「各包」。
  - **knip 根工作区。** 设为 `project: []`：根目录没有源码，其下的子目录要么是 workspace，要么是文档。依赖检查不受影响。
  - **`allowBuilds`。** 初始为空，因为本次安装没有遇到需要构建的依赖。
- **风险结论**：
  - R1：TS 7.0.2 可用，`tsc --noEmit`、vitest、knip 都正常。
  - R2：在本机，另一份没有执行 `mise trust` 的克隆也能直接 `mise install` 并加载 `[env]`，可能与本机已有的信任状态有关；新机器上的行为未验证，所以仍保留 `mise trust` 这一步。
  - R3：pnpm 12 接受 `strictPeerDependencies`，安装时没有告警。
- **本机环境变化**：用 `brew install mise` 安装了 mise。node 26.13.1、pnpm 12.23.0、gitleaks、gh 由 mise 安装在它自己的目录中；没有改 shell 配置。
- **下一步**：P0-CI-01（CI 应使用 `pnpm install --frozen-lockfile`，并检查 `.nvmrc` 与 `.mise.toml` 一致）；P0-REPO-05 可以并行。
