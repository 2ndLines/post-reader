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

填写于 2026-11-26，在负责人 `/goal` 授权下自行推进。本卡叠在 P0-REPO-02 的分支上。

- **镜像**：05 §3.2 与附录 D 给出了镜像与 compose 片段，`<digest>` 待填；PostgreSQL 18 的数据目录约定要在首次搭建时核对。
- **V1、V4、V5 的预定回退**（05 §1.2）：V1 不通过回退 Node 24；V4 不通过换 S3 替身；V5 不通过时，该区改用 ECDSA P-256。
- **本机条件**：Docker 29.9.3（arm64）可用。
- **云凭据**：两区云账号的只读权限不在助手手中，助手也不使用本机上的任何云凭据（playbook §1.3）。

## 计划（助手填写）

- **`docker-compose.yml`**：
  - 服务：PostgreSQL 18.7、Valkey 8.1.12、SeaweedFS 4.55（`server -s3`）、Mailpit v1.34.0；Jaeger 2.23.0 属于 `tracing` profile，默认不启动。
  - 镜像选用发布已满 3 天的 tag，并按多架构 index digest 固定。
  - 端口只绑定 127.0.0.1；四个服务都有健康检查。
- **初始化**：
  - `s3-init` 用同一 SeaweedFS 镜像，以幂等方式创建 5 个 bucket。
  - `postgres-init` 创建 `testbench` schema。
- **命令与本地配置**：`pnpm dev`（`up --wait` 后运行 `s3-init`）、`pnpm dev:down`；`env.example` 只含本地账号。
- **验证脚本 `tools/verify`**：独立项目，不进入主工作区，但使用同样的供应链设置。
  - `v1`：BullMQ、Testcontainers（镜像引用直接读 `docker-compose.yml`）、drizzle-kit、promptfoo、Pulumi。
  - `v4`：预签名、分段上传、DeleteObjects 三类操作，与 S3 文档行为逐项对照。
- **V5**：查阅两区官方文档并引用原文；只读 API 的部分留给负责人。
- **结论**：写入 ADR 0017（V1、V4）与 ADR 0018（V5），并同步 00、01、02、05。

## 风险与问题（助手填写）

- **R1 V5 的只读 API 未执行**：结论来自官方文档（AWS 支持 Ed25519；阿里云的规格页与 CreateKey 文档都没有 Ed25519）。按 05 §1.2 执行回退：国内区改用 ECDSA P-256。待负责人用只读 API 复核，查询命令见 ADR 0018。
- **R2 promptfoo 依赖树的许可证（P3 前需负责人决定）**：BlueOak 有 9 个包，另有 PSF、LGPL 的 libvips、一个 `SEE LICENSE` 和一个 Unknown。本卡没有修改许可证策略，详见 ADR 0017 约束 6。
- **R3 postgres 18.7 镜像的 digest 当天刚重建**：这是官方镜像的例行重建，版本号没变，不属于 3 天规则针对的新版本。之后的更新由 Renovate 负责，它也遵守冷却期。
- **R4 CI 不运行 V1、V4**：这两个脚本需要 Docker 与本地容器，只作为本地回归脚本保留。

## 交接记录（会话结束时填写）

**2026-11-26 · AC1–AC3、AC5 已完成；AC4 的文档部分已完成，只读 API 复核待负责人**

验证在从本分支克隆的干净副本中进行，开始前先 `docker compose down -v` 清掉旧数据卷：
- **AC1**：
  - `pnpm dev` 退出码 0；postgres、valkey、s3、mailpit 四个服务都是 `Healthy`；新建了 5 个 bucket；`testbench` schema 存在。
  - 再次执行 `pnpm dev`，退出码仍为 0，已有 bucket 显示为 `exists`。第一版脚本重复执行会失败，已修复。
  - `--profile tracing` 启动 Jaeger 后 UI 返回 200。
  - 最后执行 `down -v` 清理。
- **AC2**：V1 共 5 项，`V1：5/5 通过`（Node 26.13.1），逐项结果见 ADR 0017。
  - 过程中发现 BullMQ 6 需要显式传入 ioredis 实例；第一次运行时，缺少 ioredis 导致 Node 以 `Abort trap: 6` 退出，原因未查明，已记入 ADR。
- **AC3**：V4 共 15 项，与 S3 文档行为全部一致（核心失败 0），差异表见 ADR 0017。
  - 发现 SDK 默认签发的预签名 PUT URL 带有空内容的 CRC32 校验和，上传真实内容会返回 `BadDigest`。改用 `WHEN_REQUIRED` 签发后正常，这一约束已写进 ADR。
- **AC4**：结论见 ADR 0018：海外区 Ed25519，国内区 ECDSA P-256，签名信封带 `alg` 与 `kid`，ECDSA 使用 P1363 原始格式。已同步 00 §5 与 D18、01 §22、02 §2 与 §3；`packages/signed-url` 不受影响，计划不变。只读 API 复核待负责人。
- **AC5**：05 §1.2 中 V1、V4 标为「已验证」，V5 标为「已验证（文档）」。
- **用户目录清理**：
  - 我在手动查看 `pulumi version` 与 `promptfoo --help` 时，没有设置 `PULUMI_HOME` 与 `PROMPTFOO_CONFIG_DIR`，结果在用户目录下生成了 `~/.pulumi` 与 `~/.promptfoo`。它们的创建时间在本会话内，内容只有日志、一个空数据库和一个 id，已删除。
  - 验证脚本本身不写用户目录：删除上述目录后重跑 V1，没有再生成。
- **下一步**：P0-REPO-04（助手工具配置）。
