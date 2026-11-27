/**
 * WebSocket 网关（02 §4.3；消息契约 packages/contracts/src/ws.ts）。路径 /v1/stream。
 * - 首帧必须是 hello（10 s 超时），校验访问令牌与签名；之后才能订阅。
 * - 每个连接一个阻塞读连接：一次 XREAD BLOCK 同时读取已订阅的全部 job:{id}:events；订阅变化时用 CLIENT UNBLOCK 唤醒。
 * - 上行 progress / seek / extend 写 job:{id}:state；cancel 走 jobs 模块（与 REST 取消相同）。
 * - 背压：发送缓冲超过 1 MB 时暂停读取 Stream。停机前发送 reconnect。
 * - 未知 t、不合契约的消息、未登录先发其他消息：关闭连接（05 §4.2）。
 * 本文件不依赖业务模块：认证、任务归属与取消由调用方注入。不记录消息内容（下行含正文与译文）。
 */
import websocket, { type WebSocket } from '@fastify/websocket';
import { type ClientMsg, parseClientMsg } from '@post-reader/contracts';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

type Hello = Extract<ClientMsg, { t: 'hello' }>;

/** 关闭码（4000–4999 为应用自定义，P3-SRV-02 Q2） */
export const CLOSE = {
  invalidMessage: 4400,
  unauthorized: 4401,
  notFound: 4404,
  helloTimeout: 4408,
  goingAway: 1001,
} as const;

export interface GatewayDeps {
  redis: Redis;
  /** 为每个连接创建专用的阻塞读连接（createRedis(url, 'blocking')） */
  createReader: () => Redis;
  /** 校验 hello 中的访问令牌与签名；失败时抛错 */
  authenticate(hello: Hello): Promise<{ userId: string; sid: string }>;
  ownsJob(userId: string, jobId: string): Promise<boolean>;
  cancelJob(userId: string, jobId: string): Promise<void>;
  helloTimeoutMs?: number;
  blockMs?: number;
  maxBufferedBytes?: number;
  /** 停机时 reconnect 的随机等待范围（毫秒） */
  reconnectAfterMs?: [number, number];
}

/** 运行时状态的保留时间，与 REST 取消一致（P3-SRV-01 Q6） */
const STATE_TTL_S = 86_400;
const MAX_PAYLOAD_BYTES = 64 * 1024;

interface Subscription {
  /** 已读到的 Stream 条目 ID */
  lastId: string;
  /** resume 时客户端已有的最大 seq；只转发更大的 */
  lastSeq: number | undefined;
}

type ResolvedDeps = Required<Omit<GatewayDeps, 'reconnectAfterMs'>> &
  Pick<GatewayDeps, 'reconnectAfterMs'>;

class Connection {
  readonly #socket: WebSocket;
  readonly #deps: ResolvedDeps;
  readonly #log: FastifyBaseLogger;
  readonly #subs = new Map<string, Subscription>();
  #user: { userId: string; sid: string } | undefined;
  #helloPending = false;
  #reader: Redis | undefined;
  #readerId: number | undefined;
  #wake: (() => void) | undefined;
  #reading = false;
  #closed = false;
  /** 上行消息按到达顺序逐条处理（客户端通常不等 hello 完成就发 subscribe） */
  #queue: Promise<void> = Promise.resolve();

  constructor(socket: WebSocket, deps: ResolvedDeps, log: FastifyBaseLogger) {
    this.#socket = socket;
    this.#deps = deps;
    this.#log = log;
  }

  start() {
    const timer = setTimeout(() => {
      if (!this.#user) this.close(CLOSE.helloTimeout, 'hello timeout');
    }, this.#deps.helloTimeoutMs);
    this.#socket.on('message', (data: Buffer, isBinary: boolean) => {
      this.#queue = this.#queue
        .then(() =>
          this.#closed ? undefined : this.#onMessage(isBinary ? undefined : data.toString()),
        )
        .catch((error: unknown) => {
          this.#log.error({ errType: (error as Error).name }, 'ws message failed');
          this.close(CLOSE.invalidMessage, 'error');
        });
    });
    this.#socket.on('close', () => {
      clearTimeout(timer);
      this.#shutdown();
    });
  }

  close(code: number, reason: string) {
    if (this.#socket.readyState === this.#socket.OPEN) this.#socket.close(code, reason);
    this.#shutdown();
  }

  #shutdown() {
    if (this.#closed) return;
    this.#closed = true;
    this.#reader?.disconnect();
    this.#wake?.();
  }

  #send(message: unknown) {
    if (this.#socket.readyState === this.#socket.OPEN) this.#socket.send(JSON.stringify(message));
  }

  async #onMessage(text: string | undefined) {
    let data: unknown;
    try {
      data = text === undefined ? undefined : JSON.parse(text);
    } catch {
      return this.close(CLOSE.invalidMessage, 'json');
    }
    const parsed = parseClientMsg(data);
    if (parsed.kind !== 'message') return this.close(CLOSE.invalidMessage, parsed.kind);
    const msg = parsed.message;

    if (msg.t === 'hello') {
      if (this.#user || this.#helloPending) return this.close(CLOSE.invalidMessage, 'hello twice');
      this.#helloPending = true;
      try {
        this.#user = await this.#deps.authenticate(msg);
      } catch {
        return this.close(CLOSE.unauthorized, 'unauthorized');
      }
      await this.#startReader();
      return;
    }
    const user = this.#user;
    if (!user) return this.close(CLOSE.invalidMessage, 'hello first');

    switch (msg.t) {
      case 'ping':
        return this.#send({ t: 'pong' });
      case 'subscribe':
      case 'resume': {
        if (!(await this.#deps.ownsJob(user.userId, msg.jobId)))
          return this.close(CLOSE.notFound, 'job');
        this.#subs.set(msg.jobId, {
          lastId: '0',
          lastSeq: msg.t === 'resume' ? msg.lastSeq : undefined,
        });
        return this.#interruptRead();
      }
      case 'cancel':
        if (!this.#subs.has(msg.jobId)) return this.close(CLOSE.notFound, 'job');
        return this.#deps.cancelJob(user.userId, msg.jobId);
      case 'progress':
      case 'seek':
      case 'extend': {
        if (!this.#subs.has(msg.jobId)) return this.close(CLOSE.notFound, 'job');
        const key = `job:${msg.jobId}:state`;
        const tx = this.#deps.redis.multi();
        if (msg.t === 'progress')
          tx.hset(key, 'position', JSON.stringify({ unitId: msg.unitId, offsetMs: msg.offsetMs }));
        if (msg.t === 'seek')
          tx.hset(key, 'seekTo', msg.unitId).publish(`job:${msg.jobId}:seek`, msg.unitId);
        if (msg.t === 'extend') tx.hset(key, 'extend', '1');
        await tx.expire(key, STATE_TTL_S).exec();
        return;
      }
    }
  }

  async #startReader() {
    this.#reader = this.#deps.createReader();
    this.#readerId = Number(await this.#reader.client('ID'));
    void this.#readLoop().catch((error: unknown) => {
      if (!this.#closed) {
        this.#log.error({ errType: (error as Error).name }, 'ws stream read failed');
        this.close(CLOSE.goingAway, 'stream');
      }
    });
  }

  /** 订阅变化：唤醒正在阻塞的 XREAD，让它带着新的订阅重新读取 */
  async #interruptRead() {
    this.#wake?.();
    // UNBLOCK 可能先于 XREAD 到达 Redis（两条连接之间没有顺序保证）：读取进行中时重试，直到真正唤醒或读取自己返回
    for (let i = 0; i < 200 && this.#reading && this.#readerId !== undefined; i++) {
      if (Number(await this.#deps.redis.client('UNBLOCK', this.#readerId)) === 1) return;
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  async #readLoop() {
    const reader = this.#reader as Redis;
    while (!this.#closed) {
      if (this.#subs.size === 0) {
        await new Promise<void>((resolve) => {
          this.#wake = resolve;
        });
        this.#wake = undefined;
        continue;
      }
      // 背压：客户端读得慢时先不读 Stream
      if (this.#socket.bufferedAmount > this.#deps.maxBufferedBytes) {
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      const jobIds = [...this.#subs.keys()];
      this.#reading = true;
      const result = (await reader
        .xread(
          'BLOCK',
          this.#deps.blockMs,
          'STREAMS',
          ...jobIds.map((id) => `job:${id}:events`),
          ...jobIds.map((id) => this.#subs.get(id)?.lastId ?? '0'),
        )
        .finally(() => {
          this.#reading = false;
        })) as [string, [string, string[]][]][] | null;
      for (const [, entries] of result ?? []) {
        for (const [entryId, fields] of entries) {
          const raw = fields[fields.indexOf('m') + 1];
          if (raw === undefined) continue;
          const message = JSON.parse(raw) as { jobId: string; seq: number };
          const sub = this.#subs.get(message.jobId);
          if (!sub) continue;
          sub.lastId = entryId;
          if (sub.lastSeq !== undefined && message.seq <= sub.lastSeq) continue;
          if (this.#socket.readyState === this.#socket.OPEN) this.#socket.send(raw);
        }
      }
    }
  }

  sendReconnect() {
    const [min, max] = this.#deps.reconnectAfterMs ?? [500, 3000];
    this.#send({ t: 'reconnect', afterMs: Math.floor(min + Math.random() * (max - min)) });
  }
}

export async function registerStreamGateway(app: FastifyInstance, deps: GatewayDeps) {
  const resolved = {
    helloTimeoutMs: 10_000,
    blockMs: 15_000,
    maxBufferedBytes: 1024 * 1024,
    ...deps,
  };
  const connections = new Set<Connection>();
  await app.register(websocket, {
    options: { maxPayload: MAX_PAYLOAD_BYTES },
    // 停机：先让客户端带随机等待重连（02 §4.3），再关闭
    preClose(done) {
      for (const c of connections) {
        c.sendReconnect();
        c.close(CLOSE.goingAway, 'shutdown');
      }
      this.websocketServer.close(() => done());
    },
  });
  app.get('/stream', { websocket: true }, (socket, request) => {
    const connection = new Connection(socket, resolved, request.log);
    connections.add(connection);
    socket.on('close', () => connections.delete(connection));
    connection.start();
  });
}
