/**
 * Sign in with Apple（02 §6.1）。受保护路径。
 * - identityToken：用 Apple 的 JWKS 验签（生产用 jose 的 createRemoteJWKSet 指向 https://appleid.apple.com/auth/keys、缓存 24 h，
 *   随 Apple 账号就绪在 P4 接入启动流程），校验 iss、aud（Bundle ID）、
 *   过期时间与 nonce。客户端发给 Apple 的是 SHA-256(nonce)，因此 token 中的 nonce 声明与请求的 nonce 的哈希比对。
 * - authorizationCode 换 Apple refresh token：需要 Apple 账号的 SIWA 私钥（APPLE_SIWA_KEY_REF），
 *   这里只定义接口，真实实现在 Apple 账号就绪后加入（P4）；测试用 mock。
 */
import { createHash } from 'node:crypto';
import { type JWTVerifyGetKey, jwtVerify } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';

export interface AppleIdentity {
  /** Apple 用户标识（auth_identities.subject） */
  subject: string;
  email: string | undefined;
}

export class AppleTokenError extends Error {
  constructor() {
    super('apple identity token rejected');
    this.name = 'AppleTokenError';
  }
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  options: { jwks: JWTVerifyGetKey; bundleId: string; nonce: string; now?: Date },
): Promise<AppleIdentity> {
  try {
    const { payload } = await jwtVerify(identityToken, options.jwks, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: options.bundleId,
      ...(options.now ? { currentDate: options.now } : {}),
    });
    const expectedNonce = createHash('sha256').update(options.nonce, 'utf8').digest('hex');
    if (typeof payload.sub !== 'string' || payload.nonce !== expectedNonce)
      throw new AppleTokenError();
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    return { subject: payload.sub, email };
  } catch {
    throw new AppleTokenError();
  }
}

/** authorizationCode 换 Apple refresh token（真实实现需要 SIWA 私钥，P4） */
export interface AppleCodeExchanger {
  exchange(authorizationCode: string): Promise<{ refreshToken: string }>;
}
