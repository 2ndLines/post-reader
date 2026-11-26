# 0006 主体后端 Fastify、海外边缘层 Hono + Workers + R2

- 状态：已批准
- 日期：2026-11-26

## 背景

主体后端运行于常驻容器，依赖原始请求体签名校验、钩子顺序、WebSocket 网关与 OTel；海外区需要就近分发切片与静态资源，边缘层的终态包含多个路由与共用中间件。

## 决策

主体后端用 Fastify；海外边缘层第一天即用 Cloudflare Workers + Hono（不经过原生 `fetch` 过渡），对象存储用 Cloudflare R2；签名 URL 用 Ed25519，签发与校验共用只依赖 Web Crypto 的 `packages/signed-url`；边缘不保存状态、不承载业务逻辑；国内区不用 Workers。

## 备选方案与不选的理由

主体改用 Hono：Node 上的 WebSocket、OTel 与签名校验生态不如 Fastify 成熟。边缘先用原生 `fetch`：边缘终态有多路由与中间件，后换框架属于返工。CloudFront + S3：下架清除时效不保证，出网费更高。

## 后果（正面、负面、需要跟进的事项）

正面：各层用最适合的工具，边缘无返工。负面：两套框架，需在 `AGENTS.md` 写清边界。

## 影响的文档与代码

02 §22.1；05 §3.8、§11；00 §2、D17、D18；03 §15
