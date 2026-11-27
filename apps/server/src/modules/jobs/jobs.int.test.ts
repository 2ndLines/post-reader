/**
 * 任务创建、查询、取消与事件流（P3-SRV-01）。真实 PostgreSQL 与 Valkey；签名与 App Attest 都开启（enforce: true），
 * 设备证明用 openssl 合成的证书链（P2-SRV-07 的夹具）。帖子是合成内容。
 */
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { loadConfigFile } from '@post-reader/config-schema';
import { eq } from 'drizzle-orm';
import { generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptField } from '../../platform/crypto/field.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { buildApp } from '../../platform/http/app.ts';
import { DekCache } from '../../platform/kms/dek-cache.ts';
import { LocalFileKms } from '../../platform/kms/local.ts';
import { getUserDek } from '../../platform/kms/user-keys.ts';
import { createLogger } from '../../platform/logger.ts';
import { createRedis } from '../../platform/redis/client.ts';
import { assertionClientData } from '../auth/attest.ts';
import { type AttestFixture, makeAttestFixture } from '../auth/attest-fixture.ts';
import type { AttestDeps } from '../auth/attest-guard.ts';
import { MemoryOutbox } from '../auth/email.ts';
import { authRoutes } from '../auth/routes.ts';
import { AuthService } from '../auth/service.ts';
import { signedHeaders } from '../auth/signing-client.ts';
import { jobsRoutes } from './routes.ts';
import { jobs, jobUnits } from './schema.ts';
import { JobsService } from './service.ts';
import { transitionJob } from './state.ts';
import { syntheticJobRequest } from './test-post.ts';
import { resolveEntitlements } from './validate.ts';

const TEAM = 'TEAM123456';
const BUNDLE = 'com.example.postreader';
const DAILY_LIMIT = 4;
const configDir = resolve(import.meta.dirname, '../../../../../config');
const prefix = `test:${randomBytes(4).toString('hex')}:`;
const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379', 'commands', {
  keyPrefix: prefix,
});
const kms = new LocalFileKms({
  keyId: 'local-test',
  masterKey: new Uint8Array(32).fill(8),
  nodeEnv: 'test',
});
const dekCache = new DekCache();
const outbox = new MemoryOutbox();
const balance = new Map<string, boolean>();
let t: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof buildApp>>;
let jobsService: JobsService;
let rootPem = '';

beforeAll(async () => {
  t = await createTestDatabase();
  const signing = await generateKeyPair('ES256');
  const auth = new AuthService({
    db: t.db,
    redis,
    kms,
    dekCache,
    signingKey: { kid: 'k1', privateKey: signing.privateKey },
    verificationKeys: [{ kid: 'k1', publicKey: signing.publicKey }],
    region: 'intl',
  });
  const attest: AttestDeps = {
    db: t.db,
    redis,
    teamId: TEAM,
    bundleId: BUNDLE,
    get rootCertificatePem() {
      return rootPem;
    },
    environment: 'development',
    enforce: true,
    nodeEnv: 'test',
  };
  const signature = { db: t.db, redis, kms, dekCache };
  const rateLimits = {
    ip: { capacity: 10_000, refillPerSecond: 10_000 },
    user: { capacity: 10_000, refillPerSecond: 10_000 },
  };
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
    dailyJobLimit: DAILY_LIMIT,
    quota: { hasBalance: async (userId) => balance.get(userId) ?? true },
    streamUrl: 'wss://api.example.com/v1/stream',
  });
  app = await buildApp({
    logger: createLogger(
      { level: 'info', region: 'intl', roles: ['bff'] },
      new Writable({ write: (_c, _e, done) => done() }),
    ),
    readiness: { ready: true },
  });
  await app.register(
    async (v1) => {
      await authRoutes(v1, {
        service: auth,
        redis,
        mailer: outbox,
        emailHashKey: randomBytes(32),
        emailLimits: { verifyMaxAttempts: 5 },
        apple: {
          jwks: async () => {
            throw new Error('unused');
          },
          bundleId: BUNDLE,
          exchanger: { exchange: async () => ({ refreshToken: 'x' }) },
        },
        signature,
        attest,
        rateLimits,
      });
      await jobsRoutes(v1, {
        db: t.db,
        redis,
        jobs: jobsService,
        auth,
        signature,
        attest,
        rateLimits,
      });
    },
    { prefix: '/v1' },
  );
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await t?.drop();
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys.map((k) => k.slice(prefix.length)));
  redis.disconnect();
});

type Client = {
  userId: string;
  session: { accessToken: string; sessionKey: string };
  fixture: AttestFixture;
  counter: number;
};

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/v1${url}`, payload: payload as object, headers });

/** 登录 → 登记 App Attest → 得到可以调用 POST /jobs 的客户端 */
async function client(email: string): Promise<Client> {
  await post('/auth/email/code', { email });
  const code = outbox.sent.at(-1)?.code as string;
  const login = (
    await post('/auth/email/verify', { email, code, deviceId: `dev-${email}`, ageConfirmed: true })
  ).json();
  const auth = { authorization: `Bearer ${login.accessToken}` };
  const { challenge } = (await post('/attest/challenge', {}, auth)).json();
  const fixture = makeAttestFixture({
    teamId: TEAM,
    bundleId: BUNDLE,
    challenge,
    environment: 'development',
  });
  rootPem = fixture.rootCertificatePem;
  const verify = await post(
    '/attest/verify',
    { keyId: fixture.keyId, attestation: fixture.attestation, challenge },
    auth,
  );
  expect(verify.statusCode).toBe(204);
  return { userId: login.user.userId, session: login, fixture, counter: 0 };
}

/** 带签名、设备断言与幂等键的 POST /jobs；attestAs 用于模拟拿别人的设备断言 */
function createJob(c: Client, body: unknown, key: string | undefined, attestAs: Client = c) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  attestAs.counter += 1;
  const clientData = assertionClientData('POST', '/v1/jobs', new TextEncoder().encode(raw), ts);
  return app.inject({
    method: 'POST',
    url: '/v1/jobs',
    payload: raw,
    headers: {
      'content-type': 'application/json',
      ...signedHeaders(c.session, 'POST', '/v1/jobs', raw, { ts }),
      'x-attest-key-id': attestAs.fixture.keyId,
      'x-attest-assertion': attestAs.fixture.makeAssertion(clientData, attestAs.counter),
      ...(key === undefined ? {} : { 'idempotency-key': key }),
    },
  });
}

const getJob = (c: Client, id: string) =>
  app.inject({
    method: 'GET',
    url: `/v1/jobs/${id}`,
    headers: { authorization: `Bearer ${c.session.accessToken}` },
  });

const cancelJob = (c: Client, id: string) =>
  app.inject({
    method: 'POST',
    url: `/v1/jobs/${id}/cancel`,
    headers: signedHeaders(c.session, 'POST', `/v1/jobs/${id}/cancel`, ''),
  });

const dispatched = async () =>
  (await redis.xrange('jobs:dispatch', '-', '+')).map(([, fields]) => fields[1] as string);

let alice: Client;
let bob: Client;
beforeAll(async () => {
  alice = await client('alice@example.com');
  bob = await client('bob@example.com');
}, 60_000);

describe('迁移 0001_jobs', () => {
  it('建出 jobs、job_units、job_segments 三张表', async () => {
    const rows = await t.sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public'`;
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(['jobs', 'job_units', 'job_segments']),
    );
  });
});

describe('POST /jobs', () => {
  it('创建：201，任务为 admitted；正文用用户 DEK 加密存储；投递到 jobs:dispatch', async () => {
    const body = await syntheticJobRequest();
    const res = await createJob(alice, body, 'k-create');
    expect(res.statusCode).toBe(201);
    const { jobId, streamUrl } = res.json();
    expect(streamUrl).toBe('wss://api.example.com/v1/stream');

    const [job] = await t.db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(job).toMatchObject({
      userId: alice.userId,
      state: 'admitted',
      cacheScope: 'PRIVATE',
      targetLang: 'zh-CN',
    });
    expect(job?.taskId).toMatch(/^[0-9a-f]{32}$/);
    expect(job?.postKey).toMatch(/^[0-9a-f]{32}$/);
    expect(job?.taskId).not.toContain(alice.userId);

    const units = await t.db.select().from(jobUnits).where(eq(jobUnits.jobId, jobId));
    expect(units.map((u) => u.unitId).sort()).toEqual(['c1', 'c2', 'post']);
    const dek = await getUserDek(t.db, kms, dekCache, alice.userId);
    const postUnit = units.find((u) => u.unitId === 'post');
    expect(Buffer.from(postUnit?.cleanTextEnc as Uint8Array).toString('utf8')).not.toContain(
      '面馆',
    );
    expect(
      decryptField(dek, postUnit?.cleanTextEnc as Uint8Array, {
        column: 'job_units.clean_text_enc',
        ownerId: alice.userId,
      }),
    ).toBe(body.post.units[0]?.cleanText);
    expect(await dispatched()).toContain(jobId);
  });

  it('幂等：同一键同一请求体返回 200 与原任务，不新建、不计入 R_daily；同一键不同请求体被拒', async () => {
    const body = await syntheticJobRequest();
    const first = (await createJob(alice, body, 'k-idem')).json();
    const dailyKey = (await redis.keys(`${prefix}rl:daily:${alice.userId}:*`))[0]?.slice(
      prefix.length,
    ) as string;
    const countBefore = await redis.get(dailyKey);
    const again = await createJob(alice, body, 'k-idem');
    expect(again.statusCode).toBe(200);
    expect(again.json().jobId).toBe(first.jobId);
    expect(await redis.get(dailyKey)).toBe(countBefore);
    const rows = await t.db.select().from(jobs).where(eq(jobs.idempotencyKey, 'k-idem'));
    expect(rows).toHaveLength(1);

    const other = await createJob(
      alice,
      await syntheticJobRequest({ targetLang: 'en-US' }),
      'k-idem',
    );
    expect(other.statusCode).toBe(400);
    expect(other.json()).toMatchObject({ code: 'VALIDATION_FAILED', detail: 'Idempotency-Key' });
    // 同一个键属于用户自己：别人用同一个键是另一个任务
    expect((await createJob(bob, body, 'k-idem')).statusCode).toBe(201);
  });

  it('缺少幂等键：VALIDATION_FAILED；摘要不符：VALIDATION_FAILED 并指出单元，不写任务', async () => {
    const missing = await createJob(bob, await syntheticJobRequest(), undefined);
    expect(missing.json()).toMatchObject({ code: 'VALIDATION_FAILED', detail: 'Idempotency-Key' });
    const tampered = await syntheticJobRequest();
    (tampered.post.units[1] as { cleanText: string }).cleanText = '被改过的评论';
    const res = await createJob(bob, tampered, 'k-tampered');
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toBe('post.units.1.hash');
    expect(
      await t.db.select().from(jobs).where(eq(jobs.idempotencyKey, 'k-tampered')),
    ).toHaveLength(0);
  });

  it('额度为 0：402 QUOTA_EXHAUSTED，不写任务、不投递', async () => {
    const carol = await client('carol@example.com');
    balance.set(carol.userId, false);
    const before = (await dispatched()).length;
    const res = await createJob(carol, await syntheticJobRequest(), 'k-quota');
    expect(res.statusCode).toBe(402);
    expect(res.json().code).toBe('QUOTA_EXHAUSTED');
    expect(await t.db.select().from(jobs).where(eq(jobs.userId, carol.userId))).toHaveLength(0);
    expect((await dispatched()).length).toBe(before);
  });

  it('R_daily：超过当日上限返回 429 DAILY_LIMIT，带 resetAt（计费时区 UTC 的次日 0 点）', async () => {
    const dave = await client('dave@example.com');
    for (let i = 0; i < DAILY_LIMIT; i++)
      expect((await createJob(dave, await syntheticJobRequest(), `k-day-${i}`)).statusCode).toBe(
        201,
      );
    const res = await createJob(dave, await syntheticJobRequest(), 'k-day-over');
    expect(res.statusCode).toBe(429);
    const problem = res.json();
    expect(problem.code).toBe('DAILY_LIMIT');
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    expect(problem.resetAt).toBe(tomorrow.toISOString());
  });

  it('并发：同一幂等键同时提交 5 次，只建一个任务，全部返回同一 jobId', async () => {
    const erin = await client('erin@example.com');
    const body = await syntheticJobRequest();
    // 断言的 counter 必须递增：按顺序生成请求，再同时发出
    const requests = Array.from({ length: 5 }, () => createJob(erin, body, 'k-race'));
    const results = await Promise.all(requests);
    const ok = results.filter((r) => r.statusCode === 200 || r.statusCode === 201);
    expect(new Set(ok.map((r) => r.json().jobId)).size).toBe(1);
    expect(await t.db.select().from(jobs).where(eq(jobs.userId, erin.userId))).toHaveLength(1);
  });

  it('设备证明必须来自本会话的设备：用别人的设备断言被拒（ATTEST_REQUIRED device）', async () => {
    const res = await createJob(alice, await syntheticJobRequest(), 'k-other-device', bob);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'ATTEST_REQUIRED', detail: 'device' });
  });

  it('没有签名：SIGNATURE_INVALID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: await syntheticJobRequest(),
      headers: {
        authorization: `Bearer ${alice.session.accessToken}`,
        'idempotency-key': 'k-nosig',
      },
    });
    expect(res.json().code).toBe('SIGNATURE_INVALID');
  });
});

describe('GET /jobs/{id} 与取消', () => {
  // R_daily 上限只有 4：本组用单独的用户
  let frank: Client;
  beforeAll(async () => {
    frank = await client('frank@example.com');
  }, 60_000);

  it('本人可查；别人的任务与不存在的 ID 一律 NOT_FOUND', async () => {
    const { jobId } = (await createJob(frank, await syntheticJobRequest(), 'k-get')).json();
    const mine = await getJob(frank, jobId);
    expect(mine.json()).toEqual({ jobId, state: 'admitted', degraded: [], readySegments: 0 });
    expect((await getJob(bob, jobId)).json().code).toBe('NOT_FOUND');
    expect((await getJob(frank, 'not-a-uuid')).statusCode).toBe(404);
    expect((await getJob(frank, '01900000-0000-7000-8000-000000000000')).statusCode).toBe(404);
  });

  it('取消：204，状态为 cancelled 并写入运行时标记；重复取消仍是 204；别人不能取消', async () => {
    const { jobId } = (await createJob(frank, await syntheticJobRequest(), 'k-cancel')).json();
    expect((await cancelJob(bob, jobId)).statusCode).toBe(404);
    expect((await cancelJob(frank, jobId)).statusCode).toBe(204);
    expect((await getJob(frank, jobId)).json().state).toBe('cancelled');
    expect(await redis.hget(`job:${jobId}:state`, 'cancelled')).toBe('1');
    expect(await redis.ttl(`job:${jobId}:state`)).toBeGreaterThan(0);
    expect((await cancelJob(frank, jobId)).statusCode).toBe(204);
    const [job] = await t.db.select().from(jobs).where(eq(jobs.id, jobId));
    expect(job?.completedAt).toBeInstanceOf(Date);
  });

  it('状态转移是条件更新：并发的两次转移只有一个成功；终态之后不能再转移', async () => {
    const { jobId } = (await createJob(frank, await syntheticJobRequest(), 'k-transition')).json();
    const results = await Promise.all([
      transitionJob(t.db, jobId, 'planning'),
      transitionJob(t.db, jobId, 'planning'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await transitionJob(t.db, jobId, 'synthesizing')).toBe(false);
    expect(await transitionJob(t.db, jobId, 'failed')).toBe(true);
    expect(await transitionJob(t.db, jobId, 'cancelled')).toBe(false);
  });
});

describe('事件流 job:{id}:events', () => {
  it('appendEvent：seq 单调递增，消息按契约校验后写入；不合契约的消息被拒绝', async () => {
    const { jobId } = (await createJob(bob, await syntheticJobRequest(), 'k-events')).json();
    expect(
      await jobsService.appendEvent(jobId, {
        t: 'job.accepted',
        branch: 'same_lang',
        expectedUnits: 3,
      }),
    ).toBe(1);
    expect(
      await jobsService.appendEvent(jobId, { t: 'job.completed', totalDurationMs: 1000 }),
    ).toBe(2);
    const entries = await redis.xrange(`job:${jobId}:events`, '-', '+');
    expect(entries.map(([, f]) => JSON.parse(f[1] as string))).toEqual([
      { t: 'job.accepted', jobId, seq: 1, branch: 'same_lang', expectedUnits: 3 },
      { t: 'job.completed', jobId, seq: 2, totalDurationMs: 1000 },
    ]);
    await expect(jobsService.appendEvent(jobId, { t: 'job.accepted' })).rejects.toThrow();
  });
});
