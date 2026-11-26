# apps/server · 主体后端规则

先读根目录 [AGENTS.md](../../AGENTS.md)；本文件只补充本端约定。
依据：架构 [02](../../docs/archs/02-backend.md) §2、§17、§22；playbook §8.2、§9.4。

## 命令
| 命令 | 状态 |
| --- | --- |
| `pnpm verify` | 可用（根目录）；宣称完成前必须通过 |
| `pnpm contracts:gen` | P1-CTR-02 起 |
| `pnpm test:int` | P2-SRV-02 起（Testcontainers：PostgreSQL 18、Redis） |
| `pnpm db:migrate:new <name>` | P2-SRV-02 起（`drizzle-kit generate`） |
| `pnpm dev` | P0-REPO-05 起（Docker Compose 拉起本地依赖） |

## 结构与边界
- Fastify 5 + zod + Drizzle（`postgres`）+ ioredis + BullMQ；一类一库（05 §2.3）
- `src/platform/` 是与业务无关的基础设施，`src/modules/` 是业务模块，`src/entry/` 按角色挂载
- 只能 import 其他模块的 `index.ts`；只写本模块拥有的表
- `package.json` 导出 `./pipeline`，供 testbench runner 以库的形式引入；不新增其他跨应用导出
- 外部调用只经 `llm-gateway`、`tts`、`moderation`、`platform/storage`；业务代码不直接 import 厂商 SDK
- 只使用 Redis 7.0 社区版命令集（ADR 0011）

## 工作方式
- 契约先行：改 `packages/contracts` → `pnpm contracts:gen` → 路由测试 → 实现
- 集成测试用 Testcontainers 的真实 PostgreSQL 与 Redis，不 mock 数据库
- 涉及 Stream、队列、账本的改动，必须附「重复投递」与「处理中崩溃」两类测试
- 迁移只用 `drizzle-kit generate` 生成；已发布的迁移不得修改；遵守先扩后缩
- 修改 `config/prompts` 必须跑完整 promptfoo 套件；不为单条用例调整提示词
- 新增日志字段时，同时确认 redact 规则覆盖该字段

## 红线
- 不记录正文、评论、译文、URL、Cookie、邮箱；不把 `userId` 传给外部厂商
- 不调用厂商的批处理或文件接口；不在结构化输出 schema 中放用户数据
- 不新增客户端可调用、却不扣额度的接口

## 受保护路径（必须负责人审阅，见 `.github/CODEOWNERS`）
- `src/modules/{auth,quota,billing,deletion}/**`、`src/platform/{crypto,kms}/**`
- `drizzle/**`、`src/modules/admin/permissions.ts`
