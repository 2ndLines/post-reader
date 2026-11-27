/**
 * 频控挂载（P2 出口条件「频控」；02 §4.2）：认证接口的 IP 令牌桶、/auth/refresh 的用户令牌桶。真实 PostgreSQL 与 Valkey。
 * 桶参数是测试专用的小值，不是标定值（标定值见 config/quotas.yaml，仍待负责人提供）。
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
import { MemoryOutbox } from './email.ts';
import { authRoutes } from './routes.ts';
import { AuthService } from './service.ts';

const prefix = `test:${randomBytes(4).toString('hex')}:`;
const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379', 'commands', {
  keyPrefix: prefix,
});
const kms = new LocalFileKms({
  keyId: 'local-test',
  masterKey: new Uint8Array(32).fill(7),
  nodeEnv: 'test',
});
const dekCache = new DekCache();
let t: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof buildApp>>;
const outbox = new MemoryOutbox();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  t = await createTestDatabase();
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
  app = await buildApp({
    logger: createLogger(
      { level: 'info', region: 'intl', roles: ['bff'] },
      new Writable({ write: (_c, _e, done) => done() }),
    ),
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
          bundleId: 'com.example.postreader',
          exchanger: { exchange: async () => ({ refreshToken: 'x' }) },
        },
        signature: { db: t.db, redis, kms, dekCache },
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
        rateLimits: {
          ip: { capacity: 3, refillPerSecond: 0.001 },
          user: { capacity: 2, refillPerSecond: 20 },
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

const post = (url: string, payload: unknown, ip: string) =>
  app.inject({ method: 'POST', url: `/v1${url}`, payload: payload as object, remoteAddress: ip });

describe('IP 令牌桶（认证接口）', () => {
  it('/auth/email/code：同一 IP 超过容量后 429 RATE_LIMITED 并带 Retry-After；其他 IP 不受影响', async () => {
    const ip = '198.51.100.1';
    const statuses = [];
    for (let i = 0; i < 4; i++)
      statuses.push(
        (await post('/auth/email/code', { email: `ip${i}@example.com` }, ip)).statusCode,
      );
    expect(statuses).toEqual([204, 204, 204, 429]);
    const limited = await post('/auth/email/code', { email: 'ip9@example.com' }, ip);
    expect(limited.json().code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    // 被限流的请求不发验证码
    expect(outbox.sent.some((m) => m.to === 'ip9@example.com')).toBe(false);
    expect(
      (await post('/auth/email/code', { email: 'other@example.com' }, '198.51.100.2')).statusCode,
    ).toBe(204);
  });

  it('/auth/apple：在验证 identityToken 之前限流（无效令牌也消耗）', async () => {
    const ip = '198.51.100.3';
    const body = {
      identityToken: 'invalid',
      authorizationCode: 'c',
      nonce: 'n',
      deviceId: 'd',
      ageConfirmed: true,
    };
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await post('/auth/apple', body, ip)).statusCode);
    expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
    expect(statuses[3]).toBe(429);
  });

  it('/auth/email/verify 不挂 IP 令牌桶（02 §4.2 只有每邮箱 5 次的限制）', async () => {
    const ip = '198.51.100.4';
    for (let i = 0; i < 5; i++) {
      const res = await post(
        '/auth/email/verify',
        { email: 'nobody@example.com', code: '000000', deviceId: 'd' },
        ip,
      );
      expect(res.statusCode).not.toBe(429);
    }
  });
});

describe('用户令牌桶（/auth/refresh）', () => {
  it('同一用户超过容量后 429；被拒绝的 refresh token 没有被轮换，等桶补充后仍可使用', async () => {
    const email = 'refresh@example.com';
    expect((await post('/auth/email/code', { email }, '203.0.113.50')).statusCode).toBe(204);
    const code = outbox.sent.at(-1)?.code as string;
    let token = (
      await post(
        '/auth/email/verify',
        { email, code, deviceId: 'd1', ageConfirmed: true },
        '203.0.113.50',
      )
    ).json().refreshToken as string;

    for (let i = 0; i < 2; i++) {
      const res = await post('/auth/refresh', { refreshToken: token }, '203.0.113.50');
      expect(res.statusCode).toBe(200);
      token = res.json().refreshToken;
    }
    const limited = await post('/auth/refresh', { refreshToken: token }, '203.0.113.50');
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe('RATE_LIMITED');

    await sleep(120);
    const again = await post('/auth/refresh', { refreshToken: token }, '203.0.113.50');
    expect(again.statusCode).toBe(200);
  });

  it('无效的 refresh token 不消耗任何用户的令牌（先校验会话，再限流）', async () => {
    const res = await post('/auth/refresh', { refreshToken: 'x'.repeat(43) }, '203.0.113.51');
    expect(res.statusCode).toBe(401);
  });
});
