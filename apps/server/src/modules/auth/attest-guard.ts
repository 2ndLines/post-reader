/**
 * App Attest 的 HTTP 部分（02 §4.1 第 6 步、§4.2 /attest/*、§10.2）。受保护路径。
 * - 挑战：一次性，5 分钟（键 attest:ch:{sid}:{challenge}）。
 * - 证明通过后把 keyId、公钥写到本会话的设备上，counter 置 0。
 * - requireAttest：校验断言，用条件 UPDATE 原子地推进 counter（并发或重放的断言只有一个成功）。
 * - 开发环境与模拟器可以放行（02 §10.2）；生产环境禁止放行，构造时即检查。
 */
import { randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { AppError } from '../../platform/http/errors.ts';
import { AttestError, assertionClientData, verifyAssertion, verifyAttestation } from './attest.ts';
import { devices, sessions } from './schema.ts';

const CHALLENGE_TTL_S = 300;
const TS_WINDOW_MS = 300_000;

export interface AttestDeps {
  db: PostgresJsDatabase;
  redis: Redis;
  teamId: string;
  bundleId: string;
  rootCertificatePem: string;
  environment: 'production' | 'development';
  /** false = 放行（只允许开发与模拟器） */
  enforce: boolean;
  nodeEnv: string;
  now?: () => Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    attestedDeviceId: string | undefined;
  }
}

export function assertAttestConfig(deps: AttestDeps): void {
  if (!deps.enforce && deps.nodeEnv === 'production')
    throw new Error('生产环境不能关闭 App Attest 校验');
}

export async function issueChallenge(deps: AttestDeps, sessionId: string) {
  const challenge = randomBytes(32).toString('base64url');
  await deps.redis.set(`attest:ch:${sessionId}:${challenge}`, '1', 'EX', CHALLENGE_TTL_S);
  const now = deps.now?.() ?? new Date();
  return { challenge, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_S * 1000).toISOString() };
}

export async function registerAttestation(
  deps: AttestDeps,
  sessionId: string,
  body: { keyId: string; attestation: string; challenge: string },
): Promise<void> {
  // 挑战一次性：DEL 返回 1 才算有效
  if ((await deps.redis.del(`attest:ch:${sessionId}:${body.challenge}`)) !== 1) {
    throw new AppError('VALIDATION_FAILED', 400, 'challenge');
  }
  let attested: ReturnType<typeof verifyAttestation>;
  try {
    attested = verifyAttestation({
      ...body,
      teamId: deps.teamId,
      bundleId: deps.bundleId,
      rootCertificatePem: deps.rootCertificatePem,
      environment: deps.environment,
      ...(deps.now ? { now: deps.now() } : {}),
    });
  } catch (error) {
    if (error instanceof AttestError) throw new AppError('VALIDATION_FAILED', 400, 'attestation');
    throw error;
  }
  const [session] = await deps.db
    .select({ deviceId: sessions.deviceId })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session?.deviceId) throw new AppError('VALIDATION_FAILED', 400, 'device');
  try {
    await deps.db
      .update(devices)
      .set({ attestKeyId: attested.keyId, publicKey: attested.publicKey, counter: 0n })
      .where(eq(devices.id, session.deviceId));
  } catch {
    // attest_key_id 唯一：同一把密钥不能登记到两台设备
    throw new AppError('VALIDATION_FAILED', 400, 'keyId');
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function requireAttest(deps: AttestDeps) {
  assertAttestConfig(deps);
  return async (request: FastifyRequest) => {
    if (!deps.enforce) return;
    const keyId = header(request, 'x-attest-key-id');
    const assertion = header(request, 'x-attest-assertion');
    const ts = header(request, 'x-ts');
    if (!keyId || !assertion || !ts) throw new AppError('ATTEST_REQUIRED', 403, 'headers');
    const now = (deps.now?.() ?? new Date()).getTime();
    if (!/^\d{1,16}$/.test(ts) || Math.abs(now - Number(ts)) > TS_WINDOW_MS)
      throw new AppError('ATTEST_REQUIRED', 403, 'timestamp');

    const [device] = await deps.db.select().from(devices).where(eq(devices.attestKeyId, keyId));
    if (!device?.publicKey) throw new AppError('ATTEST_REQUIRED', 403, 'unknown key');
    const q = request.url.indexOf('?');
    let counter: bigint;
    try {
      ({ counter } = verifyAssertion({
        assertion,
        clientData: assertionClientData(
          request.method,
          q === -1 ? request.url : request.url.slice(0, q),
          request.rawBody ?? Buffer.alloc(0),
          ts,
        ),
        publicKey: device.publicKey,
        previousCounter: device.counter,
        teamId: deps.teamId,
        bundleId: deps.bundleId,
      }));
    } catch (error) {
      if (error instanceof AttestError) throw new AppError('ATTEST_REQUIRED', 403, error.step);
      throw error;
    }
    const advanced = await deps.db
      .update(devices)
      .set({ counter })
      .where(and(eq(devices.id, device.id), lt(devices.counter, counter)))
      .returning({ id: devices.id });
    if (advanced.length === 0) throw new AppError('ATTEST_REQUIRED', 403, 'counter');
    request.attestedDeviceId = device.id;
  };
}
