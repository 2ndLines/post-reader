/**
 * App Attest 全流程（02 §10.2；enforce: true）。证书链由 attest-fixture.ts 用 openssl 合成。
 */
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { buildApp } from '../../platform/http/app.ts';
import { DekCache } from '../../platform/kms/dek-cache.ts';
import { LocalFileKms } from '../../platform/kms/local.ts';
import { createLogger } from '../../platform/logger.ts';
import { createRedis } from '../../platform/redis/client.ts';
import { assertionClientData } from './attest.ts';
import { type AttestFixture, makeAttestFixture } from './attest-fixture.ts';
import { type AttestDeps, assertAttestConfig } from './attest-guard.ts';
import { MemoryOutbox } from './email.ts';
import { authRoutes } from './routes.ts';
import { AuthService } from './service.ts';

const TEAM = 'TEAM123456';
const BUNDLE = 'com.example.postreader';
const prefix = `test:${randomBytes(4).toString('hex')}:`;
const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379', 'commands', {
  keyPrefix: prefix,
});
let t: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof buildApp>>;
let outbox: MemoryOutbox;
let rootPem = '';

/** 根证书在第一个夹具生成后才有；用 getter 让路由读到当前值 */
const attestDeps = (db: AttestDeps['db']): AttestDeps => ({
  db,
  redis,
  teamId: TEAM,
  bundleId: BUNDLE,
  get rootCertificatePem() {
    return rootPem;
  },
  environment: 'development',
  enforce: true,
  nodeEnv: 'test',
});

beforeAll(async () => {
  t = await createTestDatabase();
  const kms = new LocalFileKms({
    keyId: 'local-test',
    masterKey: new Uint8Array(32).fill(6),
    nodeEnv: 'test',
  });
  const dekCache = new DekCache();
  const signing = await generateKeyPair('ES256');
  const service = new AuthService({
    db: t.db,
    redis,
    kms,
    dekCache,
    signingKey: { kid: 'k1', privateKey: signing.privateKey },
    verificationKeys: [{ kid: 'k1', publicKey: signing.publicKey }],
    region: 'intl',
  });
  outbox = new MemoryOutbox();
  const sink = new Writable({ write: (_c, _e, done) => done() });
  app = await buildApp({
    logger: createLogger({ level: 'info', region: 'intl', roles: ['bff'] }, sink),
    readiness: { ready: true },
  });
  await app.register(
    (v1) =>
      authRoutes(v1, {
        service,
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
        signature: { db: t.db, redis, kms, dekCache },
        attest: attestDeps(t.db),
        rateLimits: {
          ip: { capacity: 10_000, refillPerSecond: 10_000 },
          user: { capacity: 10_000, refillPerSecond: 10_000 },
        },
      }),
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

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/v1${url}`, payload: payload as object, headers });

async function login(email: string, deviceId: string) {
  await post('/auth/email/code', { email });
  const code = outbox.sent.at(-1)?.code as string;
  return (
    await post('/auth/email/verify', { email, code, deviceId, ageConfirmed: true })
  ).json() as {
    accessToken: string;
    refreshToken: string;
  };
}

/** 登录 → 取挑战 → 用该挑战合成证明 → 登记 */
async function attestedDevice(email: string, deviceId: string) {
  const session = await login(email, deviceId);
  const auth = { authorization: `Bearer ${session.accessToken}` };
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
  return { session, fixture, challenge, verify, auth };
}

function refreshHeaders(
  fixture: AttestFixture,
  body: string,
  counter: number,
  ts = String(Date.now()),
) {
  const clientData = assertionClientData(
    'POST',
    '/v1/auth/refresh',
    new TextEncoder().encode(body),
    ts,
  );
  return {
    'content-type': 'application/json',
    'x-ts': ts,
    'x-attest-key-id': fixture.keyId,
    'x-attest-assertion': fixture.makeAssertion(clientData, counter),
  };
}

const refresh = (fixture: AttestFixture, refreshToken: string, counter: number) => {
  const body = JSON.stringify({ refreshToken });
  return app.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: body,
    headers: refreshHeaders(fixture, body, counter),
  });
};

describe('App Attest 登记与断言（enforce: true）', () => {
  it('登记设备后，用断言刷新成功；同一断言（counter 未递增）重放被拒', async () => {
    const { session, fixture, verify } = await attestedDevice('a@example.com', 'phone-a');
    expect(verify.statusCode).toBe(204);
    const first = await refresh(fixture, session.refreshToken, 1);
    expect(first.statusCode).toBe(200);
    const next = first.json();
    const replay = await refresh(fixture, next.refreshToken, 1);
    expect(replay.statusCode).toBe(403);
    expect(replay.json()).toMatchObject({ code: 'ATTEST_REQUIRED', detail: 'counter' });
    expect((await refresh(fixture, next.refreshToken, 2)).statusCode).toBe(200);
  }, 60_000);

  it('挑战只能用一次；伪造的挑战被拒', async () => {
    const { fixture, challenge, auth } = await attestedDevice('b@example.com', 'phone-b');
    const again = await post(
      '/attest/verify',
      { keyId: fixture.keyId, attestation: fixture.attestation, challenge },
      auth,
    );
    expect(again.json()).toMatchObject({ code: 'VALIDATION_FAILED', detail: 'challenge' });
    const forged = await post(
      '/attest/verify',
      { keyId: fixture.keyId, attestation: fixture.attestation, challenge: 'made-up' },
      auth,
    );
    expect(forged.json()).toMatchObject({ code: 'VALIDATION_FAILED', detail: 'challenge' });
  }, 60_000);

  it('证明不能通过校验（证明是为别的挑战生成的）：VALIDATION_FAILED attestation', async () => {
    const session = await login('c@example.com', 'phone-c');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { challenge } = (await post('/attest/challenge', {}, auth)).json();
    const other = makeAttestFixture({
      teamId: TEAM,
      bundleId: BUNDLE,
      challenge: 'some-other-challenge',
      environment: 'development',
    });
    rootPem = other.rootCertificatePem;
    const res = await post(
      '/attest/verify',
      { keyId: other.keyId, attestation: other.attestation, challenge },
      auth,
    );
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED', detail: 'attestation' });
  }, 60_000);

  it('刷新时缺少断言头、未知的 keyId：ATTEST_REQUIRED', async () => {
    const session = await login('d@example.com', 'phone-d');
    const missing = await post('/auth/refresh', { refreshToken: session.refreshToken });
    expect(missing.json()).toMatchObject({ code: 'ATTEST_REQUIRED', detail: 'headers' });
    const body = JSON.stringify({ refreshToken: session.refreshToken });
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'x-ts': String(Date.now()),
        'x-attest-key-id': 'AAAA',
        'x-attest-assertion': 'AAAA',
      },
    });
    expect(unknown.json()).toMatchObject({ code: 'ATTEST_REQUIRED', detail: 'unknown key' });
  });

  it('用自己设备的断言去刷新别人的会话：ATTEST_REQUIRED device', async () => {
    const mine = await attestedDevice('e@example.com', 'phone-e');
    const victim = await login('f@example.com', 'phone-f');
    const res = await refresh(mine.fixture, victim.refreshToken, 1);
    expect(res.json()).toMatchObject({ code: 'ATTEST_REQUIRED', detail: 'device' });
  }, 60_000);

  it('断言的时间戳超出 ±300 s：ATTEST_REQUIRED timestamp', async () => {
    const { session, fixture } = await attestedDevice('g@example.com', 'phone-g');
    const body = JSON.stringify({ refreshToken: session.refreshToken });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: body,
      headers: refreshHeaders(fixture, body, 1, String(Date.now() - 400_000)),
    });
    expect(res.json()).toMatchObject({ code: 'ATTEST_REQUIRED', detail: 'timestamp' });
  }, 60_000);
});

describe('配置护栏', () => {
  it('生产环境不能关闭 App Attest 校验', () => {
    expect(() =>
      assertAttestConfig({ ...attestDeps(t.db), enforce: false, nodeEnv: 'production' }),
    ).toThrow('生产');
    expect(() =>
      assertAttestConfig({ ...attestDeps(t.db), enforce: false, nodeEnv: 'development' }),
    ).not.toThrow();
  });
});
