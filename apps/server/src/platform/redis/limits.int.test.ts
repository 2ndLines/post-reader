import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from './client.ts';
import {
  claimNonce,
  claimOtpCooldown,
  countDailyJob,
  isSessionRevoked,
  revokeSession,
  takeToken,
} from './limits.ts';

// 真实 Valkey（本地 pnpm dev；CI 为 service 容器，与 docker-compose.yml 同一 digest）。每次运行用独立的键前缀。
const prefix = `test:${randomBytes(4).toString('hex')}:`;
const redis = createRedis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379', 'commands', {
  keyPrefix: prefix,
});
afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  // keys() 返回带前缀的键，del 时 ioredis 会再加一次前缀，所以先去掉
  if (keys.length > 0) await redis.del(...keys.map((k) => k.slice(prefix.length)));
  redis.disconnect();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('令牌桶（Lua，02 §11.3）', () => {
  it('容量用尽后拒绝，并给出等待时间；按速率补充后恢复', async () => {
    const params = { capacity: 3, refillPerSecond: 20 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await takeToken(redis, 'user', 'u-refill', params));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterMs).toBeGreaterThan(0);
    expect(results[3]?.retryAfterMs).toBeLessThanOrEqual(50);
    await sleep(80);
    expect((await takeToken(redis, 'user', 'u-refill', params)).allowed).toBe(true);
  });

  it('并发 20 次只放行容量个数（原子性）', async () => {
    const params = { capacity: 5, refillPerSecond: 0.001 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => takeToken(redis, 'ip', '203.0.113.9', params)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it('消耗大于容量时始终拒绝；键带 120 s 的 TTL', async () => {
    const result = await takeToken(redis, 'user', 'u-big', { capacity: 2, refillPerSecond: 1 }, 3);
    expect(result.allowed).toBe(false);
    const ttl = await redis.pttl('rl:tb:user:u-big');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120_000);
  });

  it('不同用户的桶互不影响', async () => {
    const params = { capacity: 1, refillPerSecond: 0.001 };
    expect((await takeToken(redis, 'user', 'a', params)).allowed).toBe(true);
    expect((await takeToken(redis, 'user', 'a', params)).allowed).toBe(false);
    expect((await takeToken(redis, 'user', 'b', params)).allowed).toBe(true);
  });
});

describe('防重放 nonce（02 §10.3）', () => {
  it('同一会话内首次通过、重放拒绝；不同会话互不影响；TTL 600 s', async () => {
    expect(await claimNonce(redis, 'sid-1', 'n-1')).toBe(true);
    expect(await claimNonce(redis, 'sid-1', 'n-1')).toBe(false);
    expect(await claimNonce(redis, 'sid-2', 'n-1')).toBe(true);
    const ttl = await redis.ttl('nonce:sid-1:n-1');
    expect(ttl).toBeGreaterThan(590);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('并发重放只有一个成功', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => claimNonce(redis, 'sid-3', 'same')),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('R_daily（02 §11.3）', () => {
  it('超过上限后拒绝；TTL = 到当地午夜 + 1 小时；不同日期分开计数', async () => {
    const day = (d: string) => countDailyJob(redis, 'u-daily', d, 2, 1000);
    expect((await day('2026-11-26')).allowed).toBe(true);
    expect((await day('2026-11-26')).allowed).toBe(true);
    expect(await day('2026-11-26')).toEqual({ allowed: false, count: 3 });
    const ttl = await redis.ttl('rl:daily:u-daily:20261126');
    expect(ttl).toBeGreaterThan(4500);
    expect(ttl).toBeLessThanOrEqual(4600);
    expect((await day('2026-11-27')).allowed).toBe(true);
  });
});

describe('会话吊销与验证码冷却', () => {
  it('吊销后可查到；访问令牌已过期（剩余 0 s）时不写入', async () => {
    await revokeSession(redis, 'sid-r', 900);
    expect(await isSessionRevoked(redis, 'sid-r')).toBe(true);
    await revokeSession(redis, 'sid-expired', 0);
    expect(await isSessionRevoked(redis, 'sid-expired')).toBe(false);
  });

  it('验证码 120 s 内只能发送一次', async () => {
    expect(await claimOtpCooldown(redis, 'eh-1')).toBe(true);
    expect(await claimOtpCooldown(redis, 'eh-1')).toBe(false);
  });
});
