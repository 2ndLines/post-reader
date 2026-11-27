# apps/admin-web · 管理后台规则

先读根目录 [AGENTS.md](../../AGENTS.md)；本文件只补充本端约定。
依据：架构 [03](../../docs/archs/03-admin-console.md) §2、§12；playbook §8.3、§9.4。

## 命令（P9 起可用，此前目录只有占位）
- `pnpm verify`：根目录统一入口；本端的组件与页面测试由它运行
- 权限矩阵测试：覆盖全部路由 × 全部角色，属于 `pnpm verify` 的一部分
- 端到端：`@playwright/test`（P9 引入）

## 技术栈与目录
- React 19 + Refine + Ant Design；共享组件在 `packages/ui`
- `src/providers/` 放 Refine 的 data、auth、access-control 等 provider
- `src/resources/` 每个 resource 一个目录
- `src/api/admin-openapi.d.ts` 由 `openapi-typescript` 生成，不手改
- 运行时配置（`apiBase`、`region`、`sentryDsn`）由部署时写入 `public/runtime-config.json`，不写死在代码里

## 规则
- 新资源先用 Refine 的资源骨架生成，再按 `packages/contracts/src/api/admin` 补字段；不手写请求类型
- 只用 Ant Design、`packages/ui` 与本应用组件；不引入其他 UI 库与 CSS 框架
- 状态只用 TanStack Query（Refine 内置）与 React 自身状态；图表只用 ECharts，日期只用 dayjs（05 §2.3）
- 每新增一个 `admin-api` 写接口，同时更新 `PERMISSIONS` 表与审计中间件覆盖，并补权限矩阵测试
- 危险操作统一用 `ConfirmAction`，按需要求填写原因与重新认证

## 红线
- 页面上不展示邮箱明文、帖子正文、评论、译文、URL
- 不在后台发布配置、不触发生产操作；这些由负责人在后台完成（playbook §1.3）

## 需负责人审阅
- `src/providers/auth-provider.ts`
- 审计中间件、任何 `compliance` 页面
- 后端 `apps/server/src/modules/admin/permissions.ts`（受保护路径）
