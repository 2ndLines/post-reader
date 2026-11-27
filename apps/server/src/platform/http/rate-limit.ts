/**
 * 令牌桶频控的挂载（02 §4.2「频控」列、§11.3）。Redis 原语见 platform/redis/limits.ts。
 * 参数来自 config/quotas.yaml 的 tokenBuckets；仍未标定时：生产环境拒绝启动，其他环境关闭该桶并在启动时列出（P2-SRV-09 Q1）。
 */
import type { FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { type TokenBucketParams, takeToken } from '../redis/limits.ts';
import { AppError } from './errors.ts';

/** 令牌桶超限：429 RATE_LIMITED，并带 Retry-After（秒，向上取整） */
export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterMs: number) {
    super('RATE_LIMITED', 429, undefined, true);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  }
}

/** 已解析的令牌桶参数；null 表示该桶未启用（只可能出现在非生产环境） */
export interface RateLimits {
  ip: TokenBucketParams | null;
  user: TokenBucketParams | null;
}

type BucketConfig = TokenBucketParams | { uncalibrated: true; source: string };

/** 把 quotas.yaml 的 tokenBuckets 解析为可用参数；生产环境不允许未标定（与 check:config --production 一致） */
export function resolveRateLimits(
  tokenBuckets: { ip: BucketConfig; user: BucketConfig },
  nodeEnv: string,
): { limits: RateLimits; disabled: string[] } {
  const disabled = (['ip', 'user'] as const).filter((k) => 'uncalibrated' in tokenBuckets[k]);
  if (disabled.length > 0 && nodeEnv === 'production') {
    throw new Error(
      `令牌桶参数未标定，生产环境拒绝启动：${disabled.map((k) => `tokenBuckets.${k}`).join(', ')}`,
    );
  }
  const pick = (k: 'ip' | 'user') => {
    const v = tokenBuckets[k];
    return 'uncalibrated' in v ? null : v;
  };
  return {
    limits: { ip: pick('ip'), user: pick('user') },
    disabled: disabled.map((k) => `tokenBuckets.${k}`),
  };
}

/** 消耗一个令牌；超限时抛 RateLimitError。参数为 null（未启用）时直接放行 */
export async function enforceBucket(
  redis: Redis,
  scope: 'ip' | 'user',
  id: string,
  params: TokenBucketParams | null,
): Promise<void> {
  if (params === null) return;
  const result = await takeToken(redis, scope, id, params);
  if (!result.allowed) throw new RateLimitError(result.retryAfterMs);
}

/** preHandler：按客户端 IP 限流（认证接口）。IP 取 request.ip；部署在代理之后时需要配置 trustProxy（P2-SRV-09 Q2） */
export function ipRateLimit(redis: Redis, params: TokenBucketParams | null) {
  return async (request: FastifyRequest) => enforceBucket(redis, 'ip', request.ip, params);
}
