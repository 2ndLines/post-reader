/**
 * 写请求的签名校验（02 §4.1 第 5 步、§10.3）。受保护路径。必须挂在认证之后（需要 request.auth.sid）。
 * 顺序：先校验时间窗与签名，再占用 nonce——没有密钥的一方无法提前耗尽合法客户端的 nonce。
 */
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { decryptField } from '../../platform/crypto/field.ts';
import {
  parseQueryPairs,
  signatureMatches,
  stringToSign,
} from '../../platform/crypto/request-signature.ts';
import { AppError } from '../../platform/http/errors.ts';
import type { DekCache } from '../../platform/kms/dek-cache.ts';
import type { Kms } from '../../platform/kms/types.ts';
import { getUserDek } from '../../platform/kms/user-keys.ts';
import { claimNonce } from '../../platform/redis/limits.ts';
import { sessions } from './schema.ts';

const WINDOW_MS = 300_000;

export interface SignatureDeps {
  db: PostgresJsDatabase;
  redis: Redis;
  kms: Kms;
  dekCache: DekCache;
  now?: () => number;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function requireSignature(deps: SignatureDeps) {
  return async (request: FastifyRequest) => {
    const auth = request.auth;
    if (!auth) throw new AppError('AUTH_EXPIRED', 401);
    const ts = header(request, 'x-ts');
    const nonce = header(request, 'x-nonce');
    const sig = header(request, 'x-sig');
    if (!ts || !nonce || !sig) throw new AppError('SIGNATURE_INVALID', 401, 'headers');
    const tsMs = /^\d{1,16}$/.test(ts) ? Number(ts) : Number.NaN;
    const now = deps.now?.() ?? Date.now();
    if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > WINDOW_MS)
      throw new AppError('SIGNATURE_INVALID', 401, 'timestamp');

    const [row] = await deps.db
      .select({ enc: sessions.sessionKeyEnc })
      .from(sessions)
      .where(eq(sessions.id, auth.sid));
    if (!row) throw new AppError('AUTH_REVOKED', 401);
    const dek = await getUserDek(deps.db, deps.kms, deps.dekCache, auth.sub);
    const sessionKey = Buffer.from(
      decryptField(dek, row.enc, { column: 'sessions.session_key_enc', ownerId: auth.sub }),
      'base64',
    );

    const q = request.url.indexOf('?');
    let query: [string, string][];
    try {
      query = parseQueryPairs(request.url);
    } catch {
      throw new AppError('SIGNATURE_INVALID', 401, 'query');
    }
    const sts = stringToSign({
      method: request.method,
      path: q === -1 ? request.url : request.url.slice(0, q),
      query,
      ts,
      nonce,
      rawBody: request.rawBody ?? Buffer.alloc(0),
    });
    if (!signatureMatches(sessionKey, sts, sig)) throw new AppError('SIGNATURE_INVALID', 401);
    if (!(await claimNonce(deps.redis, auth.sid, nonce)))
      throw new AppError('REPLAY_DETECTED', 401);
  };
}
