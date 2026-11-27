/**
 * Redis 连接（05 §4.2：普通命令与阻塞读分开连接；BullMQ 用专用连接且 maxRetriesPerRequest: null，ADR 0017 约束 4）。
 * 只使用 Redis 7.0 社区版命令集（ADR 0011；国内阿里云 Redis 开源版 7.0、海外 Valkey 都支持）。
 */
import { Redis } from 'ioredis';

export function createRedis(
  url: string,
  purpose: 'commands' | 'blocking' | 'queue' = 'commands',
  options: { keyPrefix?: string; lazyConnect?: boolean } = {},
): Redis {
  return new Redis(url, {
    connectionName: `post-reader-${purpose}`,
    // 队列与阻塞读不能因单条命令重试上限而失败（BullMQ 要求）
    maxRetriesPerRequest: purpose === 'commands' ? 3 : null,
    enableReadyCheck: true,
    lazyConnect: options.lazyConnect ?? false,
    ...(options.keyPrefix ? { keyPrefix: options.keyPrefix } : {}),
  });
}
