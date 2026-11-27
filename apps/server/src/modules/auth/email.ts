/**
 * 邮箱验证码（02 §4.2、§11.3；《完整技术架构》§12.1 `otp:{emailHash}`、`otp:cd:{emailHash}`）。受保护路径。
 * - 邮箱只以 HMAC 形式出现在键与数据库中；验证码只存 SHA-256；日志中不出现邮箱与验证码（根 AGENTS.md 红线）。
 * - 发送冷却 120 s；每个邮箱 10 分钟内最多验证 5 次；比较用常数时间。
 */
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import { claimOtpCooldown } from '../../platform/redis/limits.ts';

const CODE_TTL_S = 600;

export interface EmailCodeLimits {
  verifyMaxAttempts: number;
}

/** 邮件发送端口：真实实现为区域邮件服务（海外 SES 或 Resend、国内邮件推送，05 §3.3、§3.4），本地为内存发件箱 */
export interface Mailer {
  sendLoginCode(to: string, code: string): Promise<void>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailHash(key: Uint8Array, email: string): string {
  return createHmac('sha256', key).update(normalizeEmail(email), 'utf8').digest('hex');
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** 返回 false 表示仍在冷却中（调用方返回 RATE_LIMITED） */
export async function issueEmailCode(
  redis: Redis,
  mailer: Mailer,
  hash: string,
  email: string,
): Promise<boolean> {
  if (!(await claimOtpCooldown(redis, hash))) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await redis
    .multi()
    .del(`otp:${hash}`)
    .hset(`otp:${hash}`, 'code', sha256(code).toString('hex'), 'attempts', '0')
    .expire(`otp:${hash}`, CODE_TTL_S)
    .exec();
  await mailer.sendLoginCode(normalizeEmail(email), code);
  return true;
}

export type VerifyResult = 'ok' | 'wrong' | 'too_many_attempts';

/** 成功后删除验证码，同一验证码不能使用第二次 */
export async function verifyEmailCode(
  redis: Redis,
  hash: string,
  code: string,
  limits: EmailCodeLimits,
): Promise<VerifyResult> {
  const key = `otp:${hash}`;
  const attempts = await redis.hincrby(key, 'attempts', 1);
  const stored = await redis.hget(key, 'code');
  if (stored === null) {
    // 没有有效验证码：刚才的 HINCRBY 建出了一个空计数键，删掉以免残留
    await redis.del(key);
    return 'wrong';
  }
  if (attempts > limits.verifyMaxAttempts) return 'too_many_attempts';
  const ok = timingSafeEqual(Buffer.from(stored, 'hex'), sha256(code));
  if (ok) await redis.del(key);
  return ok ? 'ok' : 'wrong';
}

/** 本地与测试用：只把邮件放在内存里，不写日志 */
export class MemoryOutbox implements Mailer {
  readonly sent: { to: string; code: string }[] = [];

  async sendLoginCode(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
  }
}
