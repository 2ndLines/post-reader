/**
 * /v1/auth/*（02 §4.2）。请求与响应 schema 来自 packages/contracts。受保护路径。
 * 频控（IP 令牌桶、用户令牌桶）在参数标定后挂载（P1-CTR-04 未标定）；签名校验在 P2-SRV-06；Attest 在 P2-SRV-07。
 */
import {
  AppleSignInRequest,
  AuthSession,
  EmailCodeRequest,
  EmailVerifyRequest,
  RefreshRequest,
  RefreshResponse,
} from '@post-reader/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { JWTVerifyGetKey } from 'jose';
import type { z } from 'zod';
import { AppError } from '../../platform/http/errors.ts';
import { type AppleCodeExchanger, AppleTokenError, verifyAppleIdentityToken } from './apple.ts';
import {
  type EmailCodeLimits,
  emailHash,
  issueEmailCode,
  type Mailer,
  normalizeEmail,
  verifyEmailCode,
} from './email.ts';
import type { AuthService } from './service.ts';

declare module 'fastify' {
  interface FastifyRequest {
    auth: Awaited<ReturnType<AuthService['authenticate']>> | undefined;
  }
}

export interface AuthRouteDeps {
  service: AuthService;
  redis: Redis;
  mailer: Mailer;
  emailHashKey: Uint8Array;
  emailLimits: EmailCodeLimits;
  apple: { jwks: JWTVerifyGetKey; bundleId: string; exchanger: AppleCodeExchanger };
}

/** preHandler：校验 Authorization: Bearer <accessToken>，结果放在 request.auth */
function requireAuth(service: AuthService) {
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new AppError('AUTH_EXPIRED', 401);
    request.auth = await service.authenticate(token);
  };
}

export async function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): Promise<void> {
  app.decorateRequest('auth', undefined);
  const { service, redis } = deps;

  app.post('/auth/email/code', { schema: { body: EmailCodeRequest } }, async (request, reply) => {
    const { email } = request.body as z.infer<typeof EmailCodeRequest>;
    const hash = emailHash(deps.emailHashKey, email);
    if (!(await issueEmailCode(redis, deps.mailer, hash, email)))
      throw new AppError('RATE_LIMITED', 429);
    return reply.status(204).send();
  });

  app.post(
    '/auth/email/verify',
    { schema: { body: EmailVerifyRequest, response: { 200: AuthSession } } },
    async (request) => {
      const body = request.body as z.infer<typeof EmailVerifyRequest>;
      const hash = emailHash(deps.emailHashKey, body.email);
      const result = await verifyEmailCode(redis, hash, body.code, deps.emailLimits);
      if (result === 'too_many_attempts') throw new AppError('RATE_LIMITED', 429);
      if (result === 'wrong') throw new AppError('VALIDATION_FAILED', 400, 'code');
      return service.login(
        { provider: 'email', subject: hash, email: normalizeEmail(body.email), emailHash: hash },
        { deviceId: body.deviceId, storefront: body.storefront, ageConfirmed: body.ageConfirmed },
      );
    },
  );

  app.post(
    '/auth/apple',
    { schema: { body: AppleSignInRequest, response: { 200: AuthSession } } },
    async (request) => {
      const body = request.body as z.infer<typeof AppleSignInRequest>;
      let identity: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
      try {
        identity = await verifyAppleIdentityToken(body.identityToken, {
          jwks: deps.apple.jwks,
          bundleId: deps.apple.bundleId,
          nonce: body.nonce,
        });
      } catch (error) {
        if (error instanceof AppleTokenError)
          throw new AppError('VALIDATION_FAILED', 400, 'identityToken');
        throw error;
      }
      // 用 authorizationCode 换 Apple refresh token（注销时吊销 Apple 令牌要用到，《完整技术架构》§11.3）
      const { refreshToken: providerRefreshToken } = await deps.apple.exchanger.exchange(
        body.authorizationCode,
      );
      return service.login(
        {
          provider: 'apple',
          subject: identity.subject,
          email: identity.email,
          providerRefreshToken,
        },
        { deviceId: body.deviceId, storefront: body.storefront, ageConfirmed: body.ageConfirmed },
      );
    },
  );

  app.post(
    '/auth/refresh',
    { schema: { body: RefreshRequest, response: { 200: RefreshResponse } } },
    async (request) => {
      const { refreshToken } = request.body as z.infer<typeof RefreshRequest>;
      return service.refresh(refreshToken);
    },
  );

  app.post('/auth/logout', { preHandler: requireAuth(service) }, async (request, reply) => {
    await service.logout(request.auth as NonNullable<FastifyRequest['auth']>);
    return reply.status(204).send();
  });
}
