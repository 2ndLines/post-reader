/**
 * 限流、防重放与会话吊销的 Redis 原语（02 §10.3、§11.3；《完整技术架构》§12.1 键设计）。
 * 参数（容量、速率、R_daily）来自 config/quotas.yaml；未标定时由调用方拒绝启动（packages/config-schema）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Redis } from 'ioredis';

const TOKEN_BUCKET_LUA = readFileSync(
  resolve(import.meta.dirname, 'scripts/token-bucket.lua'),
  'utf8',
);
const TOKEN_BUCKET_TTL_MS = 120_000;
const NONCE_TTL_S = 600;
const OTP_COOLDOWN_S = 120;

export interface TokenBucketParams {
  capacity: number;
  refillPerSecond: number;
}

export interface TokenBucketResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/** 令牌桶：原子地补充并消耗（Lua）；拒绝时给出需要等待的毫秒数 */
export async function takeToken(
  redis: Redis,
  scope: 'user' | 'ip',
  id: string,
  params: TokenBucketParams,
  cost = 1,
): Promise<TokenBucketResult> {
  const [allowed, remaining, wait] = (await redis.eval(
    TOKEN_BUCKET_LUA,
    1,
    `rl:tb:${scope}:${id}`,
    params.capacity,
    params.refillPerSecond,
    cost,
    TOKEN_BUCKET_TTL_MS,
  )) as [number, number, number];
  return { allowed: allowed === 1, remaining, retryAfterMs: wait };
}

/** 请求防重放（02 §10.3）：同一会话内 nonce 600 s 内只能使用一次；返回 true 表示首次使用 */
export async function claimNonce(redis: Redis, sessionId: string, nonce: string): Promise<boolean> {
  return (await redis.set(`nonce:${sessionId}:${nonce}`, '1', 'EX', NONCE_TTL_S, 'NX')) === 'OK';
}

/**
 * R_daily（02 §11.3）：计数加一并判断是否超限；键按账户计费时区的日期区分，TTL = 当日结束 + 1 小时。
 * 只应在 POST /jobs 成功受理或重新生成时调用。超限时不回退计数（与「拦截时不发起云端合成」一致，主 PRD 11.2）。
 */
export async function countDailyJob(
  redis: Redis,
  userId: string,
  localDate: string,
  limit: number,
  secondsUntilLocalMidnight: number,
): Promise<{ allowed: boolean; count: number }> {
  const key = `rl:daily:${userId}:${localDate.replaceAll('-', '')}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, secondsUntilLocalMidnight + 3600);
  return { allowed: count <= limit, count };
}

/** 会话吊销黑名单（《完整技术架构》§12.1 sess:revoked:{sid}，TTL = 访问令牌剩余有效期） */
export async function revokeSession(
  redis: Redis,
  sessionId: string,
  accessTokenRemainingS: number,
): Promise<void> {
  if (accessTokenRemainingS > 0)
    await redis.set(`sess:revoked:${sessionId}`, '1', 'EX', accessTokenRemainingS);
}

export async function isSessionRevoked(redis: Redis, sessionId: string): Promise<boolean> {
  return (await redis.exists(`sess:revoked:${sessionId}`)) === 1;
}

/** 验证码重发冷却（02 §11.3：SET NX EX 120）；返回 true 表示可以发送 */
export async function claimOtpCooldown(redis: Redis, emailHash: string): Promise<boolean> {
  return (await redis.set(`otp:cd:${emailHash}`, '1', 'EX', OTP_COOLDOWN_S, 'NX')) === 'OK';
}
