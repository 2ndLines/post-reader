# P3-SRV-02 WebSocket 网关

## 目标
实现 `/v1/stream`（02 §4.3）：`hello` 鉴权、订阅与 `resume`、按 Stream 实时转发下行事件、上行 `progress` / `seek` / `extend` / `cancel`、背压与停机前的 `reconnect`。

## 依据
- 手册：playbook §6.5（P3-SRV-02：`hello`、订阅、`resume`、`progress`、背压）
- 架构：02 §4.3、§11.2（`job:{id}:events`）、§10.3（签名）；《完整技术架构》§10.3（WebSocket 在 `hello` 时做一次同样的签名校验）
- 依赖：05 §4.2（`@fastify/websocket`，已定：消息必须过 `contracts` 的判别联合解析，未知 `t` 关闭连接）
- 契约：`packages/contracts/src/ws.ts`（`ClientMsg`、`ServerMsg`、`parseClientMsg`）

## 交付物
- `apps/server/src/platform/ws/gateway.ts`：连接管理（不依赖业务模块，认证、任务归属、取消由调用方注入）
- `apps/server/src/modules/jobs/stream.ts`：把网关接到认证与 jobs 模块；`JobsService.owns`
- `auth/signature-guard.ts`：抽出 `verifySignedParts`，供 HTTP 与 `hello` 共用（受保护路径，行为不变）
- 依赖：`@fastify/websocket` 11.3.7（05 已登记为「已定」，不另写 ADR）
- 集成测试 `stream.int.test.ts`

## 验收标准（助手起草，2026-11-27；负责人确认前视为草案）
1. `hello` 后 `subscribe`：先收到订阅前已有的事件，再实时收到新事件；`resume` 只收到 `lastSeq` 之后的事件 —— 集成测试
2. 一个连接订阅多个任务都能收到；订阅变化时唤醒正在阻塞的读取，不必等满 15 s —— 集成测试
3. 拒绝：10 s 内没有 `hello`、首帧不是 `hello`、未知 `t`、非 JSON、签名错误、`hello` 的 nonce 重放、令牌无效、订阅别人的任务，各自以约定的关闭码关闭 —— 集成测试
4. 上行：`progress`、`seek` 写入 `job:{id}:state`，`seek` 发布到 `job:{id}:seek`；`cancel` 与 REST 取消效果相同；未订阅的任务不能操作 —— 集成测试
5. 停机：先发送 `reconnect`（500–3000 ms 随机），再以 1001 关闭 —— 集成测试
6. `pnpm verify`、`pnpm test:int`、`knip`、许可证检查、`ci` 与 `integration` 工作流全绿

## 范围外
- `hello.capabilities`：01 §8.3 与 02 §22.5 提到，但 `contracts` 的 `hello` 还没有这个字段。属于契约变更，另开任务。
- 消费 `job:{id}:state` 推进滚动合成窗口：orchestrator 与 audio-worker（P3-PIPE-02、03）。
- 多实例部署时的连接数与 Redis 连接数规划（02 §14.4 伸缩，P3-INFRA-01）。

## 上下文摘要（助手填写）
填写于 2026-11-27，在负责人 `/goal` 授权下自行推进。本卡叠在 `feat/p3-srv-01` 上。

- 02 §4.3 要求：每个连接维护订阅集合；同一连接内用一个 Redis 连接，以 `XREAD BLOCK 15000` 读取多个流。
- 背压阈值为发送缓冲 1 MB；停机前发送 `{ t: 'reconnect', afterMs: random(500, 3000) }`。
- `hello` 带 `accessToken`、`ts`、`nonce`、`sig`。签名「与 HTTP 相同」，但没有写明签名串的组成。
- 05 §4.2：服务端遇到未知 `t` 关闭连接。客户端遇到未知下行类型则忽略，两侧规则不同。

## 计划（助手填写）
- **阻塞读**：每个连接一个专用的阻塞读连接（`createRedis(url, 'blocking')`），一次 `XREAD` 读取全部订阅。
  - 订阅变化时，从普通命令连接发送 `CLIENT UNBLOCK <id>` 唤醒。
  - 两条连接之间没有顺序保证，UNBLOCK 可能先于 XREAD 到达，所以读取进行中时重试，直到真正唤醒。
- **消息顺序**：上行消息逐条按到达顺序处理。客户端通常不等 `hello` 完成就发 `subscribe`。
- **订阅的起点**：从 Stream 起点读取，这样订阅前已经写入的事件也能收到。`resume` 用 `lastSeq` 过滤（`isSeqAdvance` 的语义）。
- **日志**：不记录消息内容，下行消息含正文与译文。

## 风险与问题（助手填写）
- **Q1 `hello` 的签名串**：按 HTTP 签名的格式，`METHOD = GET`、`PATH = /v1/stream`，查询串与请求体为空，`X-Ts` 与 `X-Nonce` 取 `hello.ts` 与 `hello.nonce`。iOS 必须逐字一致，待负责人确认。
- **Q2 关闭码**：设计没有规定，默认如下：
  - 4400：消息不合法、未知 `t`、首帧不是 `hello`
  - 4401：鉴权或签名失败
  - 4404：任务不存在或不属于本人
  - 4408：`hello` 超时
  - 1001：停机
- **Q3 `extend`**：只写入 `job:{id}:state.extend = 1`，具体语义（单篇上限后的继续生成，02 §22.2、§23.2）由流水线实现。字段名为默认值。
- **Q4 运行时状态的保留**：`job:{id}:state` 在每次写入后设 24 小时过期，与 REST 取消一致（P3-SRV-01 Q6）。
- **R1 `CLIENT UNBLOCK`**：属于 Redis 5.0 起的命令，在 Valkey 上已实测。阿里云 Redis 开源版 7.0 应当支持（ADR 0011 的命令集），国内预发时需要复核。
- **R2 事件流的保留**：`job:{id}:events` 仍没有过期与长度上限。客户端可以 `resume` 的窗口有多长，设计没有给出，待负责人决定；默认在任务进入终态后保留 24 小时，由流水线写终态事件时设置。
- **R3 连接数**：每个 WS 连接占一个 Redis 连接。规模上来后可改为每进程一个读取器、按订阅分发，接口不变。

## 交接记录（会话结束时填写）
**2026-11-27 · AC1–AC5 已完成；AC6 见 PR 的 CI**
- **集成测试**：新增 10 条，全部集成测试共 76 条，都通过。jobs 与 stream 两组连续运行 3 次，结果稳定。
- **唤醒的验证**：订阅两个任务的用例中，第二次订阅发生在读取已经阻塞之后，并要求 1.5 s 内收到两个流的事件。默认阻塞 15 s，所以这个用例只有在唤醒生效时才会通过。
- **检查**：`pnpm verify`、`knip`、`lint` 都通过；许可证检查覆盖 228 个包，违规 0。
- **下一步**：P3-SRV-04（quota：账本、核销、软着陆）。
