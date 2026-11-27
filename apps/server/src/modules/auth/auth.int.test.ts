/**
 * 认证全流程（P2 出口条件：登录、刷新、吊销）。真实 PostgreSQL 与 Valkey；Apple 的 JWKS 用本地生成的密钥对代替。
 */
import { createHash, randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptField } from '../../platform/crypto/field.ts';
import {
  computeSignature,
  parseQueryPairs,
  stringToSign,
} from '../../platform/crypto/request-signature.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { buildApp } from '../../platform/http/app.ts';
import { DekCache } from '../../platform/kms/dek-cache.ts';
import { LocalFileKms } from '../../platform/kms/local.ts';
import { getUserDek } from '../../platform/kms/user-keys.ts';
import { createLogger } from '../../platform/logger.ts';
import { createRedis } from '../../platform/redis/client.ts';
import { MemoryOutbox } from './email.ts';
import { authRoutes, requireAuth } from './routes.ts';
import { authIdentities, sessions, users } from './schema.ts';
import { AuthService } from './service.ts';
import { requireSignature } from './signature-guard.ts';

const BUNDLE_ID = 'com.example.postreader';
const prefix = `test:${randomBytes(4).toString('hex')}:`;
let t: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof buildApp>>;
let outbox: MemoryOutbox;
let logs: string[];
let appleKey: CryptoKey;
const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379', 'commands', {
  keyPrefix: prefix,
});
const kms = new LocalFileKms({
  keyId: 'local-test',
  masterKey: new Uint8Array(32).fill(5),
  nodeEnv: 'test',
});
const dekCache = new DekCache();

beforeAll(async () => {
  t = await createTestDatabase();
  const signing = await generateKeyPair('ES256');
  const apple = await generateKeyPair('RS256');
  appleKey = apple.privateKey;
  const appleJwk = { ...(await exportJWK(apple.publicKey)), kid: 'apple-test', alg: 'RS256' };
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
  logs = [];
  const stream = new Writable({
    write(chunk, _e, done) {
      logs.push(String(chunk));
      done();
    },
  });
  app = await buildApp({
    logger: createLogger({ level: 'info', region: 'intl', roles: ['bff'] }, stream),
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
          jwks: createLocalJWKSet({ keys: [appleJwk] }),
          bundleId: BUNDLE_ID,
          exchanger: { exchange: async () => ({ refreshToken: 'apple-refresh-token-value' }) },
        },
        signature: { db: t.db, redis, kms, dekCache },
      }),
    { prefix: '/v1' },
  );
  // 只在测试中注册：需要认证与签名、本身没有副作用的路由，用于端到端验证重放
  app.post(
    '/v1/_test/signed',
    { preHandler: [requireAuth(service), requireSignature({ db: t.db, redis, kms, dekCache })] },
    async (_request, reply) => reply.status(204).send(),
  );
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await t?.drop();
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys.map((k) => k.slice(prefix.length)));
  redis.disconnect();
});

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/v1${url}`, payload: payload as object, headers });

type Session = { accessToken: string; sessionKey: string };

/** 客户端签名（与 iOS SigningMiddleware 相同的算法；本实现已对独立的 Python 黄金向量验证过） */
function signedHeaders(
  session: Session,
  method: string,
  url: string,
  body: string,
  overrides: Partial<{ ts: string; nonce: string; key: Uint8Array }> = {},
) {
  const ts = overrides.ts ?? String(Date.now());
  const nonce = overrides.nonce ?? randomBytes(8).toString('hex');
  const q = url.indexOf('?');
  const sts = stringToSign({
    method,
    path: q === -1 ? url : url.slice(0, q),
    query: parseQueryPairs(url),
    ts,
    nonce,
    rawBody: new TextEncoder().encode(body),
  });
  return {
    authorization: `Bearer ${session.accessToken}`,
    'x-ts': ts,
    'x-nonce': nonce,
    'x-sig': computeSignature(overrides.key ?? Buffer.from(session.sessionKey, 'base64'), sts),
  };
}

const logout = (session: Session, overrides = {}) =>
  app.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: signedHeaders(session, 'POST', '/v1/auth/logout', '', overrides),
  });

async function emailLogin(email: string, extra: Record<string, unknown> = { ageConfirmed: true }) {
  expect((await post('/auth/email/code', { email })).statusCode).toBe(204);
  const code = outbox.sent.at(-1)?.code as string;
  return post('/auth/email/verify', { email, code, deviceId: 'device-1', ...extra });
}

describe('邮箱验证码登录', () => {
  it('首次登录注册新用户：返回令牌与会话密钥，邮箱加密存储，会话密钥用 DEK 加密', async () => {
    const res = await emailLogin('Alice@Example.com');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ homeRegion: 'intl', tier: 'free' });
    expect(Buffer.from(body.sessionKey, 'base64')).toHaveLength(32);

    const [user] = await t.db.select().from(users).where(eq(users.id, body.user.userId));
    expect(user?.ageConfirmedAt).toBeInstanceOf(Date);
    expect(user?.billingTz).toBe('UTC');
    const dek = await getUserDek(t.db, kms, dekCache, body.user.userId);
    expect(
      decryptField(dek, user?.emailEnc as Uint8Array, {
        column: 'users.email_enc',
        ownerId: body.user.userId,
      }),
    ).toBe('alice@example.com');
    const [session] = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, body.user.userId));
    const stored = decryptField(dek, session?.sessionKeyEnc as Uint8Array, {
      column: 'sessions.session_key_enc',
      ownerId: body.user.userId,
    });
    expect(stored).toBe(body.sessionKey);
    expect(session?.refreshHash).not.toBe(body.refreshToken);
  });

  it('同一邮箱再次登录是同一用户（大小写不影响；首尾空白由契约拒绝，客户端负责去除）', async () => {
    const a = (await emailLogin('bob@example.com')).json();
    await redis.del(
      `otp:cd:${(await t.db.select().from(users).where(eq(users.id, a.user.userId)))[0]?.emailHash}`,
    );
    const b = (await emailLogin('BOB@Example.com', {})).json();
    expect((await post('/auth/email/code', { email: ' bob@example.com' })).statusCode).toBe(400);
    expect(b.user.userId).toBe(a.user.userId);
  });

  it('首次注册未确认年满 18 岁：VALIDATION_FAILED（age_confirmation_required）', async () => {
    const res = await emailLogin('minor@example.com', {});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      detail: 'age_confirmation_required',
    });
  });

  it('120 s 内重复发送：RATE_LIMITED', async () => {
    expect((await post('/auth/email/code', { email: 'carol@example.com' })).statusCode).toBe(204);
    const res = await post('/auth/email/code', { email: 'carol@example.com' });
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('RATE_LIMITED');
  });

  it('验证码错误：VALIDATION_FAILED；第 6 次起 RATE_LIMITED；正确验证码只能用一次', async () => {
    await post('/auth/email/code', { email: 'dave@example.com' });
    const code = outbox.sent.at(-1)?.code as string;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await post('/auth/email/verify', {
            email: 'dave@example.com',
            code: wrong,
            deviceId: 'd',
          })
        ).statusCode,
      ).toBe(400);
    }
    const locked = await post('/auth/email/verify', {
      email: 'dave@example.com',
      code,
      deviceId: 'd',
      ageConfirmed: true,
    });
    expect(locked.json().code).toBe('RATE_LIMITED');

    const ok = await emailLogin('erin@example.com');
    expect(ok.statusCode).toBe(200);
    const reused = await post('/auth/email/verify', {
      email: 'erin@example.com',
      code: outbox.sent.at(-1)?.code,
      deviceId: 'd',
    });
    expect(reused.statusCode).toBe(400);
  });

  it('店面属于另一区：REGION_MISMATCH（海外区收到 CHN）', async () => {
    const res = await emailLogin('frank@example.com', { ageConfirmed: true, storefront: 'CHN' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('REGION_MISMATCH');
  });

  it('日志中不出现邮箱与验证码', () => {
    const all = logs.join('');
    expect(all).not.toContain('alice@example.com');
    for (const { code } of outbox.sent) expect(all).not.toContain(`"${code}"`);
  });
});

describe('Sign in with Apple', () => {
  async function identityToken(nonce: string, overrides: { aud?: string; sub?: string } = {}) {
    return new SignJWT({
      nonce: createHash('sha256').update(nonce).digest('hex'),
      email: 'apple-user@privaterelay.appleid.com',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'apple-test' })
      .setIssuer('https://appleid.apple.com')
      .setAudience(overrides.aud ?? BUNDLE_ID)
      .setSubject(overrides.sub ?? '001234.apple-sub')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(appleKey);
  }

  it('验签通过后登录；Apple refresh token 加密存储', async () => {
    const res = await post('/auth/apple', {
      identityToken: await identityToken('n-1'),
      authorizationCode: 'code',
      nonce: 'n-1',
      deviceId: 'iphone',
      ageConfirmed: true,
    });
    expect(res.statusCode).toBe(200);
    const userId = res.json().user.userId;
    const [identity] = await t.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId));
    const dek = await getUserDek(t.db, kms, dekCache, userId);
    expect(
      decryptField(dek, identity?.providerRefreshEnc as Uint8Array, {
        column: 'auth_identities.provider_refresh_enc',
        ownerId: userId,
      }),
    ).toBe('apple-refresh-token-value');
  });

  const rejected: [string, { nonce: string; tokenNonce: string; aud?: string }][] = [
    ['nonce 不符', { nonce: 'n-2', tokenNonce: 'other' }],
    ['audience 不是本应用', { nonce: 'n-3', tokenNonce: 'n-3', aud: 'com.other.app' }],
  ];
  it.each(rejected)('拒绝：%s', async (_name, c) => {
    const token = await identityToken(c.tokenNonce, c.aud ? { aud: c.aud } : {});
    const res = await post('/auth/apple', {
      identityToken: token,
      authorizationCode: 'x',
      nonce: c.nonce,
      deviceId: 'd',
      ageConfirmed: true,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED', detail: 'identityToken' });
  });
});

describe('刷新、轮换与吊销（02 §10.1）', () => {
  it('刷新返回新的令牌对；旧 refresh token 再次使用时吊销整个 family，已签发的访问令牌一并失效', async () => {
    const first = (await emailLogin('gina@example.com')).json();
    const second = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(second.statusCode).toBe(200);
    const rotated = second.json();
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    const reuse = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().code).toBe('AUTH_REVOKED');

    // family 已吊销：轮换后的新 refresh token 与访问令牌也不能再用
    expect((await post('/auth/refresh', { refreshToken: rotated.refreshToken })).json().code).toBe(
      'AUTH_REVOKED',
    );
    const logout = await post(
      '/auth/logout',
      {},
      { authorization: `Bearer ${rotated.accessToken}` },
    );
    expect(logout.json().code).toBe('AUTH_REVOKED');
  });

  it('并发用同一个 refresh token 刷新：只有一个成功', async () => {
    const login = (await emailLogin('hank@example.com')).json();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/auth/refresh', { refreshToken: login.refreshToken })),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
  });

  it('未知的 refresh token：AUTH_EXPIRED', async () => {
    const res = await post('/auth/refresh', {
      refreshToken: randomBytes(32).toString('base64url'),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('AUTH_EXPIRED');
  });

  it('退出登录后访问令牌立即失效、refresh token 不可再用', async () => {
    const login = (await emailLogin('ivy@example.com')).json();
    expect((await logout(login)).statusCode).toBe(204);
    expect((await logout(login)).json().code).toBe('AUTH_REVOKED');
    expect((await post('/auth/refresh', { refreshToken: login.refreshToken })).json().code).toBe(
      'AUTH_REVOKED',
    );
  });

  it('缺少或伪造的访问令牌：AUTH_EXPIRED', async () => {
    expect((await post('/auth/logout', {})).json().code).toBe('AUTH_EXPIRED');
    expect(
      (await post('/auth/logout', {}, { authorization: 'Bearer not.a.jwt' })).json().code,
    ).toBe('AUTH_EXPIRED');
  });
});

describe('请求签名与防重放（02 §10.3；P2 出口条件）', () => {
  let session: Session;
  beforeAll(async () => {
    session = (await emailLogin('sig@example.com')).json();
  });
  const expectCode = async (
    res: Promise<{ statusCode: number; json: () => { code: string; detail?: string } }>,
    code: string,
  ) => {
    const r = await res;
    expect(r.statusCode).toBe(401);
    expect(r.json().code).toBe(code);
    return r.json();
  };

  it('签名错误的请求被拒：用错的密钥、缺少签名头', async () => {
    await expectCode(logout(session, { key: randomBytes(32) }), 'SIGNATURE_INVALID');
    const missing = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(missing.json()).toMatchObject({ code: 'SIGNATURE_INVALID', detail: 'headers' });
  });

  it('时间戳超出 ±300 s：SIGNATURE_INVALID（timestamp）', async () => {
    const old = await expectCode(
      logout(session, { ts: String(Date.now() - 301_000) }),
      'SIGNATURE_INVALID',
    );
    expect(old.detail).toBe('timestamp');
    await expectCode(logout(session, { ts: String(Date.now() + 301_000) }), 'SIGNATURE_INVALID');
    await expectCode(logout(session, { ts: 'not-a-number' }), 'SIGNATURE_INVALID');
  });

  it('签名覆盖请求体、路径与查询串：任一被改动都失败', async () => {
    const signedFor = (url: string, body: string) => signedHeaders(session, 'POST', url, body);
    const tamperedBody = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { ...signedFor('/v1/auth/logout', '{"a":1}'), 'content-type': 'application/json' },
      payload: '{"a":2}',
    });
    expect(tamperedBody.json().code).toBe('SIGNATURE_INVALID');
    const tamperedQuery = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout?x=2',
      headers: signedFor('/v1/auth/logout?x=1', ''),
    });
    expect(tamperedQuery.json().code).toBe('SIGNATURE_INVALID');
    const tamperedPath = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: signedFor('/v1/auth/other', ''),
    });
    expect(tamperedPath.json().code).toBe('SIGNATURE_INVALID');
  });

  it('同一请求原样重放：第一次通过，第二次 REPLAY_DETECTED', async () => {
    const url = '/v1/_test/signed';
    const headers = signedHeaders(session, 'POST', url, '');
    expect((await app.inject({ method: 'POST', url, headers })).statusCode).toBe(204);
    await expectCode(app.inject({ method: 'POST', url, headers }), 'REPLAY_DETECTED');
  });

  it('签名失败的请求不会占用 nonce：随后用同一 nonce 的正确签名仍能通过', async () => {
    const url = '/v1/_test/signed';
    await expectCode(
      app.inject({
        method: 'POST',
        url,
        headers: signedHeaders(session, 'POST', url, '', { nonce: 'n-1', key: randomBytes(32) }),
      }),
      'SIGNATURE_INVALID',
    );
    const ok = await app.inject({
      method: 'POST',
      url,
      headers: signedHeaders(session, 'POST', url, '', { nonce: 'n-1' }),
    });
    expect(ok.statusCode).toBe(204);
  });

  it('并发重放同一请求：只有一个通过', async () => {
    const url = '/v1/_test/signed';
    const headers = signedHeaders(session, 'POST', url, '');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => app.inject({ method: 'POST', url, headers })),
    );
    expect(results.filter((r) => r.statusCode === 204)).toHaveLength(1);
    const rejected = results.filter((r) => r.statusCode !== 204);
    expect(rejected.map((r) => [r.statusCode, r.json().code])).toEqual(
      Array(4).fill([401, 'REPLAY_DETECTED']),
    );
  });

  it('查询串中的 + 按字面参与签名（不当作空格）', async () => {
    const url = '/v1/_test/signed?q=a+b';
    const res = await app.inject({
      method: 'POST',
      url,
      headers: signedHeaders(session, 'POST', url, ''),
    });
    expect(res.statusCode).toBe(204);
  });
});
