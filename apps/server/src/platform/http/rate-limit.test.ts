import { describe, expect, it } from 'vitest';
import { RateLimitError, resolveRateLimits } from './rate-limit.ts';

const bucket = { capacity: 5, refillPerSecond: 1 };
const uncalibrated = { uncalibrated: true as const, source: '《风控与反滥用策略规范》' };

describe('resolveRateLimits', () => {
  it('已标定：原样返回参数', () => {
    expect(resolveRateLimits({ ip: bucket, user: bucket }, 'production')).toEqual({
      limits: { ip: bucket, user: bucket },
      disabled: [],
    });
  });

  it('生产环境有未标定的桶：拒绝启动，并列出是哪一个', () => {
    expect(() => resolveRateLimits({ ip: uncalibrated, user: bucket }, 'production')).toThrow(
      'tokenBuckets.ip',
    );
  });

  it('非生产环境：未标定的桶关闭，并列出', () => {
    expect(resolveRateLimits({ ip: uncalibrated, user: uncalibrated }, 'development')).toEqual({
      limits: { ip: null, user: null },
      disabled: ['tokenBuckets.ip', 'tokenBuckets.user'],
    });
  });
});

describe('RateLimitError', () => {
  it('Retry-After 按秒向上取整，至少 1 秒', () => {
    expect(new RateLimitError(1).retryAfterSeconds).toBe(1);
    expect(new RateLimitError(1001).retryAfterSeconds).toBe(2);
    expect(new RateLimitError(0).retryAfterSeconds).toBe(1);
    expect(new RateLimitError(10).status).toBe(429);
  });
});
