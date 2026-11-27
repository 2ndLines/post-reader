import { describe, expect, it } from 'vitest';
import { createRedis } from './client.ts';

describe('createRedis（05 §4.2、ADR 0017 约束 4）', () => {
  it.each([
    ['commands', 3],
    ['blocking', null],
    ['queue', null],
  ] as const)('%s 连接的 maxRetriesPerRequest 为 %s', (purpose, expected) => {
    const redis = createRedis('redis://127.0.0.1:6379', purpose, { lazyConnect: true });
    expect(redis.options.maxRetriesPerRequest).toBe(expected);
    expect(redis.options.connectionName).toBe(`post-reader-${purpose}`);
    redis.disconnect();
  });
});
