# P0-REPO-05 本地容器环境与验证项 V1、V4、V5

## 目标
`pnpm dev` 一条命令拉起本地依赖；三项未经实测的默认选择得到结论并写入 ADR。

## 依据
- 架构：05 §1.2（V1、V4、V5）、§3.2（本地开发容器）、附录 D（`docker-compose.yml` 片段）
- 手册：playbook §2.3、§6.2

## 交付物
- `docker-compose.yml`：PostgreSQL 18、Valkey 8、SeaweedFS（`server -s3`）、Mailpit；镜像按 digest 固定；可选 `tracing` profile 启动 Jaeger；不得使用 MinIO
- 初始化脚本：创建 bucket、`testbench` schema
- `env.example`（仅本地账号）；`pnpm dev`、`pnpm dev:down`
- 验证脚本与结论（`tools/verify/` + ADR）：
  - **V1**：Node 26 下 BullMQ（对 Valkey 入队、消费）、Testcontainers（启动上表同 digest 镜像）、drizzle-kit（生成与执行一次空迁移）、promptfoo（运行一条本地断言）、Pulumi CLI（`pulumi version` 与本地后端 `preview` 空 stack）
  - **V4**：SeaweedFS 的预签名 GET/PUT、分段上传、`DeleteObjects`；与 AWS S3、OSS 文档行为逐项对照，差异列表写入 ADR
  - **V5**：两区 KMS 是否支持 Ed25519 非对称签名，以官方文档与只读 API（列出可用密钥规格）为证据

## 验收标准
1. 干净机器上 `pnpm dev` 后四个服务健康检查通过 —— 输出
2. V1 脚本 5 项全部通过，或失败项按 05 §1.2「回退」执行并写 ADR —— 输出与 ADR
3. V4 脚本覆盖三类操作，结果与差异表写入 ADR —— 输出与 ADR
4. V5 结论写入 ADR：两区都支持则维持 Ed25519；任一区不支持则该区改用 ECDSA P-256、客户端两种都接受，同时更新 00、02 相关章节与 `packages/signed-url` 计划 —— ADR 与文档差异
5. 05 §1.2 中 V1、V4、V5 状态更新为已验证

## 范围外
vendor-mock（P2）；海外与国内云资源创建（P3、P10）。

## 需负责人
V5 需要两区云账号的只读查询权限，或由负责人执行查询并贴回结果。

## 上下文摘要（助手填写）
## 计划（助手填写）
## 风险与问题（助手填写）
## 交接记录（会话结束时填写）
