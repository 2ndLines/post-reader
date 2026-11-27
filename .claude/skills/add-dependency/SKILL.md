---
name: add-dependency
description: 新增任何依赖库、外部服务、云资源、GitHub Action、MCP 服务器或 CLI 工具时使用：按 05 §2.1 准入检查，写依赖 ADR，在 05 对应表中登记，并固定版本。
---

# add-dependency：引入依赖或外部资源

依据：docs/archs/05-toolchain-and-resources.md §2（通用引入规范）、§2.7（引入、升级、移除流程）、附录 A（依赖 ADR 模板）、§4（各端三方库清单）。

## 步骤
1. **先查是否已登记**：在 05 §4 各表中搜索。已登记为「已定」时，按登记的规范使用（仍要固定版本），跳到第 6 步。§2.3「一类一库」中列为「不得引入」的，直接停下。
2. **准入检查（05 §2.1）**：逐条记录用途与替代方案、维护状态（最近发布、Issue 响应）、下载量与依赖树规模、安全记录。
3. **许可证（05 §2.2）**：用 `pnpm check:licenses` 检查新增的依赖树。新出现的许可证不在允许清单中时，不修改清单，在 ADR 中列出并请负责人决定（改清单就是改门禁）。
4. **供应链（05 §2.5）**：
   - 版本发布满 3 天（`minimumReleaseAge`），用 `pnpm add -E` 固定精确版本。
   - 新依赖需要运行安装脚本时，在 `allowBuilds` 中逐个写 `true` 或 `false`，并在 PR 中说明原因。
   - GitHub Action 按 40 位 SHA 固定，并在注释中写版本（`pnpm check:pins`）。
   - Docker 镜像按多架构 index digest 固定。
5. **写依赖 ADR**：`docs/adr/NNNN-dep-<name>.md`，用 05 附录 A 模板，并更新 `docs/adr/README.md` 的索引。
6. **登记**：在 05 对应的表中加一行（库、用途、位置、阶段、状态、使用规范）；工具类加到 §5.1，并在 `.mise.toml` 中固定版本。
7. **验证**：`pnpm verify`、`pnpm knip`、`pnpm check:licenses`；PR 中附依赖树规模与许可证检查的结果。

## 完成时必须产出
- 精确版本的 `package.json` 改动与锁文件
- 依赖 ADR（已登记为「已定」的除外），以及 05 中的登记行
- PR 描述中的准入检查、许可证与 `allowBuilds` 说明
- 安全敏感包（05 §5.5 列表）明确请求负责人审阅
