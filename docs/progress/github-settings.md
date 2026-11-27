# GitHub 仓库设置清单（负责人操作）

来源：任务卡 P0-CI-01「需负责人」；playbook §2.1；P0 出口条件（playbook §6.2）。
状态：待负责人执行（2026-11-26 起草）。仓库 `2ndLines/post-reader`，个人账号，公开仓库。

## 1. 先定：助手用什么身份推送与提 PR

**问题**：P0 期间，助手是用负责人本机的 `gh` 凭证（账号 `2ndLines`）推送分支、创建 PR 的，所以 PR 的作者就是负责人本人。GitHub 不允许作者批准自己的 PR。如果开启「必须 1 人批准」或「必须 Code Owner 审阅」，而仓库里又只有负责人一个协作者，那么所有 PR 都无法合并。

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| **A（建议）助手用独立身份** | 新建一个机器用户（例如 `post-reader-bot`），以 Write 权限加入仓库；本机为助手单独配置它的 fine-grained PAT（只授权本仓库的 Contents 与 Pull requests 读写，不授权 Administration）。或者改用 GitHub App 安装令牌 | 作者是 bot，负责人是审阅人，「必须批准」与 CODEOWNERS 能真正起作用。代价是多维护一个账号或 App |
| B 负责人凭证 + 不要求批准 | 规则集中把必需批准数设为 0，只要求 `ci` 通过 | 无法满足 playbook §2.1「必须负责人批准」，受保护路径也失去强制审阅。不建议 |

在作出选择之前，助手继续用当前凭证推送非 `main` 分支、创建 PR，但不合并任何 PR。

## 2. `main` 分支规则集（方案 A 落实后开启）

在 Settings → Rules → Rulesets → New branch ruleset 中，Target 选默认分支，Enforcement 设为 Active，然后勾选：

- [ ] Restrict deletions（禁止删除分支）
- [ ] Block force pushes（禁止强推）
- [ ] Require a pull request before merging（合并前必须经过 PR）：
  - Required approvals：1
  - Dismiss stale pull request approvals when new commits are pushed（有新提交时作废旧的批准）
  - Require review from Code Owners（必须 Code Owner 审阅；CODEOWNERS 在 P0-REPO-03 建立）
  - Require conversation resolution before merging（合并前必须解决所有评论）
- [ ] Require status checks to pass（状态检查必须通过）：添加 `ci`（工作流 `ci` 中的 job 名）；勾选 Require branches to be up to date before merging（合并前分支必须与 `main` 同步）
- [ ] Bypass list（可绕过规则的名单）：留空，负责人自己也不绕过

也可以用命令行创建：

```bash
gh api -X POST repos/2ndLines/post-reader/rulesets --input - <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "ci" } ] } }
  ]
}
JSON
```

## 3. 仓库其他设置

- [ ] Settings → Actions → General：
  - Actions permissions：Allow select actions，只允许 `actions/*` 与 `pnpm/action-setup`（05 §5.3 规则 6）
  - Workflow permissions：Read repository contents permission（工作流默认只读）
  - 不勾选 Allow GitHub Actions to create and approve pull requests（不允许 Actions 创建和批准 PR）
- [ ] Settings → General → Pull Requests：不勾选 Allow auto-merge（不允许自动合并）；勾选 Automatically delete head branches（合并后自动删除分支）
- [ ] Settings → Code security：开启 Secret scanning 与 Push protection（与 CI 中的 gitleaks 互为补充）；开启 Dependabot alerts（只开告警，依赖升级 PR 仍由 Renovate 负责，05 §5.5）

## 4. 验证（P0 出口条件）

开启规则集后，在本地执行：

```bash
git push origin main   # 预期被拒绝：GH013 Repository rule violations
```

把输出贴到 P0-CI-01 任务卡的交接记录中（验收标准 4）。
