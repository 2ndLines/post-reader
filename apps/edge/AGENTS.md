# apps/edge · 海外区边缘层规则

先读根目录 [AGENTS.md](../../AGENTS.md)；本文件只补充本端约定。
依据：[ADR 0006](../../docs/adr/0006-主体后端Fastify、海外边缘层Hono+Workers+R2.md)；架构 [02](../../docs/archs/02-backend.md) §22.1；05 §3.8。

## 命令
| 命令 | 状态 |
| --- | --- |
| `pnpm verify` | 可用（根目录）；本端测试用 Vitest 加 Workers 测试环境 |
| `wrangler dev` | P3-INFRA-01 起，只用于本地开发 |
| 部署 | 由 Pulumi 的 Cloudflare provider 与海外区堆栈同一次发布、同一次回滚；不用 Wrangler 部署 |

## 职责
- 运行在 Cloudflare Workers，框架为 Hono（第一天即用）
- 承载的路由：
  - `GET /seg/:sha.m4a`：公共与私有切片
  - `GET /samples` 与样帖音频
  - `GET /config/bundle`、`GET /exports/:id`
  - 后台与台架的静态资源（前置 Cloudflare Access）
- 不承载：鉴权签发、编排、合成、计费、WebSocket、任何数据库写入
- 边缘不保存状态，也不承载业务逻辑

## 规则
- 中间件：
  - `signedUrl`：用 `packages/signed-url` 校验 Ed25519 公钥签名
  - `jwtVerify`：ES256 公钥，只用于 `/samples`
  - 统一的缓存头与 RFC 9457 错误格式
- 缓存：
  - 公共切片按切片摘要缓存（`immutable`）
  - 私有切片 `no-store`，链接有效期不超过 `T_priv_ttl`
- 存储：Cloudflare R2，通过 Workers 绑定直接读；写入只由主体后端经 S3 兼容接口完成
- 签名格式用共享黄金向量，Node 与 Workers 两端都要跑
- 只用 Web 标准 API；不依赖 Node 专有模块

## 红线
- 日志与错误中不出现 URL 中的签名参数、用户标识或内容
- 不在边缘新增需要鉴权签发或写入的路由；需要这类能力时，先写 ADR
