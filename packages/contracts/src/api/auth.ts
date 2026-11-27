/** /auth/*、/attest/*（02 §4.2、§10、§23.3） */
import { z } from 'zod';
import { Region, Tier, UtcDateTime } from '../common.ts';

/** App Store 店面，ISO 3166-1 alpha-3（config/regions.yaml 使用 CHN 等，02 §21） */
const Storefront = z.string().regex(/^[A-Z]{3}$/);
const Base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, '应为 base64');

const loginContext = {
  deviceId: z.string().min(1),
  /** 缺少时登录不拦截（02 §21 regions.yaml） */
  storefront: Storefront.optional(),
  /** 首次注册必须为 true，否则 VALIDATION_FAILED（age_confirmation_required，02 §23.3）；已注册用户可省略 */
  ageConfirmed: z.boolean().optional(),
};

export const AppleSignInRequest = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1),
  nonce: z.string().min(1),
  ...loginContext,
});

export const EmailCodeRequest = z.object({ email: z.email() });

export const EmailVerifyRequest = z.object({
  email: z.email(),
  code: z.string().min(1).max(16),
  ...loginContext,
});

export const AuthUser = z.object({ userId: z.string().min(1), homeRegion: Region, tier: Tier });

export const AuthSession = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** 请求签名用的会话密钥 k_sess，base64（02 §10.1、§10.3） */
  sessionKey: Base64,
  user: AuthUser,
});

export const RefreshRequest = z.object({ refreshToken: z.string().min(1) });
export const RefreshResponse = AuthSession.omit({ user: true });

export const AttestChallengeResponse = z.object({
  /** 一次性，5 分钟有效 */
  challenge: z.string().min(1),
  expiresAt: UtcDateTime,
});

export const AttestVerifyRequest = z.object({
  keyId: z.string().min(1),
  /** App Attest 证明对象，CBOR 的 base64 */
  attestation: Base64,
  challenge: z.string().min(1),
});
