/**
 * WebSocket 网关（P3-SRV-02，02 §4.3）。真实 PostgreSQL 与 Valkey；客户端为 Node 内置的 WebSocket。帖子是合成内容。
 */
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { loadConfigFile } from '@post-reader/config-schema';
import { eq } from 'drizzle-orm';
import { generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { buildApp } from '../../platform/http/app.ts';
import { DekCache } from '../../platform/kms/dek-cache.ts';
import { LocalFileKms } from '../../platform/kms/local.ts';
import { createLogger } from '../../platform/logger.ts';
import { createRedis } from '../../platform/redis/client.ts';
import { CLOSE, registerStreamGateway } from '../../platform/ws/gateway.ts';
import { MemoryOutbox } from '../auth/email.ts';
import { authRoutes } from '../auth/routes.ts';
import { AuthService } from '../auth/service.ts';
import { type Session, signedHeaders } from '../auth/signing-client.ts';
import { jobs } from './schema.ts';
import { JobsService } from './service.ts';
import { STREAM_PATH, streamGatewayDeps } from './stream.ts';
import { syntheticJobRequest } from './test-post.ts';
import { resolveEntitlements } from './validate.ts';

const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379';
const configDir = resolve(import.meta.dirname, '../../../../../config');
const prefix = `test:${randomBytes(4).toString('hex')}:`;
const redis = createRedis(REDIS_URL, 'commands', { keyPrefix: prefix });
const kms = new LocalFileKms({
  keyId: 'local-test',
  masterKey: new Uint8Array(32).fill(9),
  nodeEnv: 'test',
});
const dekCache = new DekCache();
const outbox = new MemoryOutbox();
const readers: ReturnType<typeof createRedis>[] = [];
let t: Awaited<ReturnType<typeof createTestDatabase>>;
let auth: AuthService;
let jobsService: JobsService;
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function startApp(): Promise<{ app: Awaited<ReturnType<typeof buildApp>>; base: string }> {
  const app = await buildApp({
    logger: createLogger(
      { level: 'info', region: 'intl', roles: ['bff'] },
      new Writable({ write: (_c, _e, done) => done() }),
    ),
    readiness: { ready: true },
  });
  const signature = { db: t.db, redis, kms, dekCache };
  await app.register(
    async (v1) => {
      await authRoutes(v1, {
        service: auth,
        redis,
        mailer: outbox,
        emailHashKey: Buffer.alloc(32, 1),
        emailLimits: { verifyMaxAttempts: 5 },
        apple: {
          jwks: async () => {
            throw new Error('unused');
          },
          bundleId: 'com.example.postreader',
          exchanger: { exchange: async () => ({ refreshToken: 'x' }) },
        },
        signature,
        attest: {
          db: t.db,
          redis,
          teamId: 'T',
          bundleId: 'com.example.postreader',
          rootCertificatePem: '',
          environment: 'development',
          enforce: false,
          nodeEnv: 'test',
        },
        rateLimits: { ip: null, user: null },
      });
      await registerStreamGateway(v1, {
        ...streamGatewayDeps({
          redis,
          createReader: () => {
            const r = createRedis(REDIS_URL, 'blocking', { keyPrefix: prefix });
            readers.push(r);
            return r;
          },
          auth,
          signature,
          jobs: jobsService,
        }),
        helloTimeoutMs: 300,
      });
    },
    { prefix: '/v1' },
  );
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  apps.push(app);
  return { app, base: address.replace('http', 'ws') };
}

let base = '';
beforeAll(async () => {
  t = await createTestDatabase();
  const signing = await generateKeyPair('ES256');
  auth = new AuthService({
    db: t.db,
    redis,
    kms,
    dekCache,
    signingKey: { kid: 'k1', privateKey: signing.privateKey },
    verificationKeys: [{ kid: 'k1', publicKey: signing.publicKey }],
    region: 'intl',
  });
  jobsService = new JobsService({
    db: t.db,
    redis,
    kms,
    dekCache,
    validation: {
      entitlements: resolveEntitlements(loadConfigFile(configDir, 'tiers.yaml'), 'test')
        .entitlements,
      limits: loadConfigFile(configDir, 'quotas.yaml').limits,
      langs: loadConfigFile(configDir, 'langs.yaml'),
      publicSites: new Set(),
    },
    dailyJobLimit: null,
    quota: { hasBalance: async () => true },
    streamUrl: 'wss://api.example.com/v1/stream',
  });
  ({ base } = await startApp());
}, 60_000);

afterAll(async () => {
  for (const app of apps) await app.close();
  for (const r of readers) r.disconnect();
  await t?.drop();
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys.map((k) => k.slice(prefix.length)));
  redis.disconnect();
});

type User = { userId: string; session: Session };

async function login(email: string): Promise<User> {
  const inject = apps[0] as Awaited<ReturnType<typeof buildApp>>;
  await inject.inject({ method: 'POST', url: '/v1/auth/email/code', payload: { email } });
  const code = outbox.sent.at(-1)?.code as string;
  const res = await inject.inject({
    method: 'POST',
    url: '/v1/auth/email/verify',
    payload: { email, code, deviceId: `d-${email}`, ageConfirmed: true },
  });
  const body = res.json();
  return { userId: body.user.userId, session: body };
}

let keySeq = 0;
async function newJob(user: User): Promise<string> {
  const body = await syntheticJobRequest();
  const raw = new TextEncoder().encode(JSON.stringify(body));
  keySeq += 1;
  return (await jobsService.create({ userId: user.userId, tier: 'pro' }, body, raw, `k-${keySeq}`))
    .jobId;
}

/** 测试客户端：收集下行消息与关闭码 */
class Client {
  readonly ws: WebSocket;
  readonly messages: Record<string, unknown>[] = [];
  closed: Promise<number>;
  readonly opened: Promise<void>;

  constructor(url = `${base}${STREAM_PATH}`) {
    this.ws = new WebSocket(url);
    this.opened = new Promise((r) => this.ws.addEventListener('open', () => r(), { once: true }));
    this.closed = new Promise((r) =>
      this.ws.addEventListener('close', (e) => r(e.code), { once: true }),
    );
    this.ws.addEventListener('message', (e) => this.messages.push(JSON.parse(String(e.data))));
  }

  async send(message: unknown) {
    await this.opened;
    this.ws.send(JSON.stringify(message));
  }

  hello(user: User, overrides: Partial<{ nonce: string; sig: string }> = {}) {
    const h = signedHeaders(
      user.session,
      'GET',
      STREAM_PATH,
      '',
      overrides.nonce ? { nonce: overrides.nonce } : {},
    );
    return this.send({
      t: 'hello',
      accessToken: user.session.accessToken,
      protocol: 1,
      ts: Number(h['x-ts']),
      nonce: h['x-nonce'],
      sig: overrides.sig ?? h['x-sig'],
    });
  }

  async waitFor(predicate: (msgs: Record<string, unknown>[]) => boolean, ms = 3000) {
    const deadline = Date.now() + ms;
    while (!predicate(this.messages)) {
      if (Date.now() > deadline)
        throw new Error(`等待超时：已收到 ${JSON.stringify(this.messages)}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  close() {
    this.ws.close();
  }
}

let alice: User;
let bob: User;
beforeAll(async () => {
  alice = await login('alice@example.com');
  bob = await login('bob@example.com');
});

const seqs = (msgs: Record<string, unknown>[], jobId: string) =>
  msgs.filter((m) => m.jobId === jobId).map((m) => m.seq);

describe('hello 与订阅', () => {
  it('hello → subscribe：先收到订阅前已有的事件，再实时收到新事件；ping → pong', async () => {
    const jobId = await newJob(alice);
    await jobsService.appendEvent(jobId, {
      t: 'job.accepted',
      branch: 'same_lang',
      expectedUnits: 3,
    });
    const c = new Client();
    await c.hello(alice);
    await c.send({ t: 'subscribe', jobId });
    await c.waitFor((m) => seqs(m, jobId).length === 1);
    await jobsService.appendEvent(jobId, { t: 'job.completed', totalDurationMs: 10 });
    await c.waitFor((m) => seqs(m, jobId).length === 2);
    expect(c.messages.filter((m) => m.jobId === jobId).map((m) => m.t)).toEqual([
      'job.accepted',
      'job.completed',
    ]);
    await c.send({ t: 'ping' });
    await c.waitFor((m) => m.some((x) => x.t === 'pong'));
    c.close();
  });

  it('resume：只收到 lastSeq 之后的事件', async () => {
    const jobId = await newJob(alice);
    for (let i = 0; i < 3; i++)
      await jobsService.appendEvent(jobId, { t: 'quota.update', remainingMc: 100 - i });
    const c = new Client();
    await c.hello(alice);
    await c.send({ t: 'resume', jobId, lastSeq: 2 });
    await c.waitFor((m) => seqs(m, jobId).length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(seqs(c.messages, jobId)).toEqual([3]);
    c.close();
  });

  it('同一连接订阅两个任务：两个流的事件都能收到（订阅变化会唤醒阻塞中的读取）', async () => {
    const a = await newJob(alice);
    const b = await newJob(alice);
    const c = new Client();
    await c.hello(alice);
    await c.send({ t: 'subscribe', jobId: a });
    await new Promise((r) => setTimeout(r, 100)); // 让读取进入阻塞
    await c.send({ t: 'subscribe', jobId: b });
    await jobsService.appendEvent(b, { t: 'job.completed', totalDurationMs: 1 });
    await jobsService.appendEvent(a, { t: 'job.completed', totalDurationMs: 2 });
    await c.waitFor((m) => seqs(m, a).length === 1 && seqs(m, b).length === 1, 1500);
    c.close();
  });
});

describe('拒绝与关闭', () => {
  it('10 s（测试中 300 ms）内没有 hello：4408', async () => {
    const c = new Client();
    expect(await c.closed).toBe(CLOSE.helloTimeout);
  });

  it('首帧不是 hello：4400；未知 t：4400；不是 JSON：4400', async () => {
    const a = new Client();
    await a.send({ t: 'subscribe', jobId: 'x' });
    expect(await a.closed).toBe(CLOSE.invalidMessage);
    const b = new Client();
    await b.hello(alice);
    await b.send({ t: 'teleport' });
    expect(await b.closed).toBe(CLOSE.invalidMessage);
    const c = new Client();
    await c.opened;
    c.ws.send('not json');
    expect(await c.closed).toBe(CLOSE.invalidMessage);
  });

  it('签名错误、hello 的 nonce 重放、令牌无效：4401', async () => {
    const a = new Client();
    await a.hello(alice, { sig: 'AAAA' });
    expect(await a.closed).toBe(CLOSE.unauthorized);
    const nonce = randomBytes(8).toString('hex');
    const first = new Client();
    await first.hello(alice, { nonce });
    await first.send({ t: 'ping' });
    await first.waitFor((m) => m.some((x) => x.t === 'pong'));
    const replay = new Client();
    await replay.hello(alice, { nonce });
    expect(await replay.closed).toBe(CLOSE.unauthorized);
    first.close();
    const bad = new Client();
    await bad.send({
      t: 'hello',
      accessToken: 'x',
      protocol: 1,
      ts: Date.now(),
      nonce: 'n',
      sig: 's',
    });
    expect(await bad.closed).toBe(CLOSE.unauthorized);
  });

  it('订阅别人的任务或不存在的任务：4404', async () => {
    const jobId = await newJob(alice);
    const c = new Client();
    await c.hello(bob);
    await c.send({ t: 'subscribe', jobId });
    expect(await c.closed).toBe(CLOSE.notFound);
  });
});

describe('上行：progress、seek、cancel', () => {
  it('progress 与 seek 写入 job:{id}:state；seek 发布到 job:{id}:seek；未订阅的任务不能操作', async () => {
    const jobId = await newJob(alice);
    const sub = createRedis(REDIS_URL, 'blocking', { keyPrefix: prefix });
    readers.push(sub);
    const published: string[] = [];
    // 发布订阅的频道名不加 keyPrefix
    await sub.subscribe(`job:${jobId}:seek`);
    sub.on('message', (_ch, message) => published.push(message));

    const c = new Client();
    await c.hello(alice);
    await c.send({ t: 'subscribe', jobId });
    await c.send({ t: 'progress', jobId, unitId: 'c1', offsetMs: 1200 });
    await c.send({ t: 'seek', jobId, unitId: 'c2' });
    await c.send({ t: 'ping' });
    await c.waitFor((m) => m.some((x) => x.t === 'pong'));
    expect(await redis.hgetall(`job:${jobId}:state`)).toEqual({
      position: JSON.stringify({ unitId: 'c1', offsetMs: 1200 }),
      seekTo: 'c2',
    });
    expect(await redis.ttl(`job:${jobId}:state`)).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(published).toEqual(['c2']);

    const other = await newJob(alice);
    await c.send({ t: 'progress', jobId: other, unitId: 'c1', offsetMs: 0 });
    expect(await c.closed).toBe(CLOSE.notFound);
  });

  it('cancel：与 REST 取消相同，任务转为 cancelled', async () => {
    const jobId = await newJob(alice);
    const c = new Client();
    await c.hello(alice);
    await c.send({ t: 'subscribe', jobId });
    await c.send({ t: 'cancel', jobId });
    await c.send({ t: 'ping' });
    await c.waitFor((m) => m.some((x) => x.t === 'pong'));
    const [job] = await t.db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(job?.state).toBe('cancelled');
    c.close();
  });
});

describe('停机', () => {
  it('关闭服务时先发送 reconnect（500–3000 ms 随机等待），再以 1001 关闭', async () => {
    const second = await startApp();
    const c = new Client(`${second.base}${STREAM_PATH}`);
    await c.hello(alice);
    await c.send({ t: 'ping' });
    await c.waitFor((m) => m.some((x) => x.t === 'pong'));
    await second.app.close();
    expect(await c.closed).toBe(CLOSE.goingAway);
    const reconnect = c.messages.find((m) => m.t === 'reconnect') as { afterMs: number };
    expect(reconnect.afterMs).toBeGreaterThanOrEqual(500);
    expect(reconnect.afterMs).toBeLessThanOrEqual(3000);
  });
});
