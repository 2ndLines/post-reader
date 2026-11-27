/**
 * 访问令牌与刷新令牌（02 §10.1）。受保护路径。
 * - access token：ES256 JWT，声明 sub、sid、region、tier、iat、exp，头部带 kid；有效期 15 分钟。
 * - refresh token：32 字节随机数（base64url），有效期 30 天；服务端只存 SHA-256。
 * 验签时显式限定 algorithms，并校验 issuer / audience（05 §4.2 jose 规范）。
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Region, Tier } from '@post-reader/contracts';
import { type CryptoKey, type JWTPayload, jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_TTL_S = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const ISSUER = 'post-reader';
const AUDIENCE = 'post-reader-api';

export interface AccessClaims {
  sub: string;
  sid: string;
  region: Region;
  tier: Tier;
}

export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
}

export interface VerificationKey {
  kid: string;
  publicKey: CryptoKey;
}

export async function issueAccessToken(
  key: SigningKey,
  claims: AccessClaims,
  now = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: claims.sid, region: claims.region, tier: claims.tier })
    .setProtectedHeader({ alg: 'ES256', kid: key.kid, typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_S)
    .sign(key.privateKey);
}

export class TokenInvalidError extends Error {
  readonly expired: boolean;

  constructor(expired: boolean) {
    super(expired ? 'access token expired' : 'access token invalid');
    this.name = 'TokenInvalidError';
    this.expired = expired;
  }
}

/** 按 kid 选择公钥（支持轮换：可同时登记多把）；未知 kid、算法不符、过期、声明缺失都拒绝 */
export async function verifyAccessToken(
  token: string,
  keys: VerificationKey[],
  now = new Date(),
): Promise<AccessClaims & { exp: number }> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(
      token,
      async (header) => {
        const key = keys.find((k) => k.kid === header.kid);
        if (!key) throw new Error('unknown kid');
        return key.publicKey;
      },
      { algorithms: ['ES256'], issuer: ISSUER, audience: AUDIENCE, currentDate: now },
    ));
  } catch (error) {
    throw new TokenInvalidError((error as { code?: string }).code === 'ERR_JWT_EXPIRED');
  }
  const { sub, sid, region, tier, exp } = payload as JWTPayload & Partial<AccessClaims>;
  if (
    !sub ||
    typeof sid !== 'string' ||
    (region !== 'cn' && region !== 'intl') ||
    typeof tier !== 'string' ||
    !exp
  ) {
    throw new TokenInvalidError(false);
  }
  return { sub, sid, region, tier: tier as Tier, exp };
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newSessionKey(): Uint8Array {
  return randomBytes(32);
}
