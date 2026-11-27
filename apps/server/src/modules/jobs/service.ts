/**
 * jobs 模块的公开接口（02 §5.4）：create、get、cancel、appendEvent。
 * create 的顺序：幂等检查 → 校验清单（validate.ts）→ 额度预检 → R_daily → 写库 → 投递 jobs:dispatch。
 * 被拒绝的请求不写任务行，客户端修正后可用同一幂等键重试。
 */
import { createHash, randomBytes } from 'node:crypto';
import type { CreateJobRequest, Tier } from '@post-reader/contracts';
import { ServerMsg } from '@post-reader/contracts';
import { and, count, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Redis } from 'ioredis';
import type { z } from 'zod';
import { encryptField } from '../../platform/crypto/field.ts';
import { AppError, dailyLimitError } from '../../platform/http/errors.ts';
import { newId } from '../../platform/id.ts';
import type { DekCache } from '../../platform/kms/dek-cache.ts';
import type { Kms } from '../../platform/kms/types.ts';
import { getUserDek } from '../../platform/kms/user-keys.ts';
import { countDailyJob } from '../../platform/redis/limits.ts';
import { users } from '../auth/schema.ts';
import { localDay } from './local-day.ts';
import { jobSegments, jobs, jobUnits } from './schema.ts';
import { isTerminal, type JobState, transitionJob } from './state.ts';
import { type ValidationContext, validateCreateJob } from './validate.ts';

type CreateInput = z.infer<typeof CreateJobRequest>;

/** 额度预检（02 §6.2「precheck 配额」）；由 quota 模块实现（P3-SRV-04） */
interface QuotaPrecheck {
  hasBalance(userId: string): Promise<boolean>;
}

export interface JobsDeps {
  db: PostgresJsDatabase;
  redis: Redis;
  kms: Kms;
  dekCache: DekCache;
  validation: Omit<ValidationContext, 'tier'>;
  /** R_daily；null 表示未标定、在非生产环境不限制 */
  dailyJobLimit: number | null;
  quota: QuotaPrecheck;
  /** WebSocket 地址（02 §4.3：/v1/stream） */
  streamUrl: string;
  now?: () => Date;
}

const DISPATCH_STREAM = 'jobs:dispatch';
/** REST 取消时写入的运行时状态的保留时间（P3-SRV-01 Q6） */
const STATE_TTL_S = 86_400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sha256Hex = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

export class JobsService {
  readonly #d: JobsDeps;

  constructor(deps: JobsDeps) {
    this.#d = deps;
  }

  #now() {
    return this.#d.now?.() ?? new Date();
  }

  /** created = false 表示幂等重放（返回原任务） */
  async create(
    user: { userId: string; tier: Tier },
    input: CreateInput,
    rawBody: Uint8Array,
    idempotencyKey: string,
  ): Promise<{ created: boolean; jobId: string; streamUrl: string }> {
    const { db } = this.#d;
    const requestSha256 = sha256Hex(rawBody);
    const replay = await this.#replay(user.userId, idempotencyKey, requestSha256);
    if (replay) return replay;

    const { cacheScope, readMode } = await validateCreateJob(input, {
      ...this.#d.validation,
      tier: user.tier,
    });
    if (!(await this.#d.quota.hasBalance(user.userId))) throw new AppError('QUOTA_EXHAUSTED', 402);
    await this.#countDaily(user.userId);

    const dek = await getUserDek(db, this.#d.kms, this.#d.dekCache, user.userId);
    const jobId = newId();
    const { source } = input.post;
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(jobs)
        .values({
          id: jobId,
          userId: user.userId,
          taskId: randomBytes(16).toString('hex'),
          postKey: sha256Hex(`${source.site}:${source.postId}`).slice(0, 32),
          cacheScope,
          prefs: input.prefs,
          targetLang: input.targetLang,
          readMode,
          passthroughLangs: input.passthroughLangs,
          state: 'admitted',
          idempotencyKey,
          requestSha256,
        })
        .onConflictDoNothing({ target: [jobs.userId, jobs.idempotencyKey] })
        .returning({ id: jobs.id });
      if (rows.length === 0) return false;
      await tx.insert(jobUnits).values(
        input.post.units.map((unit, position) => ({
          jobId,
          unitId: unit.unitId,
          authorId: unit.authorId,
          kind: unit.kind,
          parentId: unit.parentId ?? null,
          position,
          cleanTextEnc: encryptField(dek, unit.cleanText, {
            column: 'job_units.clean_text_enc',
            ownerId: user.userId,
          }),
          clientHash: unit.hash,
        })),
      );
      return true;
    });
    if (!inserted) {
      // 同一幂等键的并发请求：另一个请求已经创建了任务
      const raced = await this.#replay(user.userId, idempotencyKey, requestSha256);
      if (raced) return raced;
      throw new Error('幂等键冲突后找不到原任务');
    }
    await this.#dispatch(jobId);
    return { created: true, jobId, streamUrl: this.#d.streamUrl };
  }

  async #replay(userId: string, idempotencyKey: string, requestSha256: string) {
    const [job] = await this.#d.db
      .select({ id: jobs.id, state: jobs.state, requestSha256: jobs.requestSha256 })
      .from(jobs)
      .where(and(eq(jobs.userId, userId), eq(jobs.idempotencyKey, idempotencyKey)));
    if (!job) return undefined;
    if (job.requestSha256 !== requestSha256)
      throw new AppError('VALIDATION_FAILED', 400, 'Idempotency-Key');
    // 上次写库成功但投递失败时，任务停在 admitted：重放时补投（消费者按 jobId 幂等）
    if (job.state === 'admitted') await this.#dispatch(job.id);
    return { created: false, jobId: job.id, streamUrl: this.#d.streamUrl };
  }

  async #countDaily(userId: string) {
    if (this.#d.dailyJobLimit === null) return;
    const [row] = await this.#d.db
      .select({ billingTz: users.billingTz })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new AppError('AUTH_EXPIRED', 401);
    const day = localDay(this.#now(), row.billingTz);
    const result = await countDailyJob(
      this.#d.redis,
      userId,
      day.date,
      this.#d.dailyJobLimit,
      day.secondsUntilMidnight,
    );
    if (!result.allowed) throw dailyLimitError(day.nextMidnight);
  }

  async #dispatch(jobId: string) {
    await this.#d.redis.xadd(DISPATCH_STREAM, '*', 'jobId', jobId);
  }

  /** 只返回本人的任务；不存在与不属于本人一律 NOT_FOUND（不暴露别人的任务是否存在） */
  async #owned(userId: string, jobId: string) {
    if (!UUID.test(jobId)) throw new AppError('NOT_FOUND', 404);
    const [job] = await this.#d.db
      .select({ id: jobs.id, state: jobs.state, degraded: jobs.degraded })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
    if (!job) throw new AppError('NOT_FOUND', 404);
    return job;
  }

  async get(userId: string, jobId: string) {
    const job = await this.#owned(userId, jobId);
    const [ready] = await this.#d.db
      .select({ n: count() })
      .from(jobSegments)
      .where(eq(jobSegments.jobId, job.id));
    return {
      jobId: job.id,
      state: job.state,
      degraded: job.degraded,
      readySegments: ready?.n ?? 0,
    };
  }

  /** 已在终态时什么也不做（重复取消是安全的） */
  async cancel(userId: string, jobId: string): Promise<void> {
    const job = await this.#owned(userId, jobId);
    if (isTerminal(job.state as JobState)) return;
    if (await transitionJob(this.#d.db, job.id, 'cancelled', this.#now())) {
      // 与 WS 上行 cancel 相同（02 §4.3）：流水线据此停止调度新的切片
      const key = `job:${job.id}:state`;
      await this.#d.redis.multi().hset(key, 'cancelled', '1').expire(key, STATE_TTL_S).exec();
    }
  }

  /** 追加一条下行事件（02 §5.4、§11.2）：seq 在任务内单调递增；消息先按契约校验 */
  async appendEvent(
    jobId: string,
    message: Record<string, unknown> & { t: string },
  ): Promise<number> {
    const seq = await this.#d.redis.incr(`job:${jobId}:seq`);
    const full = ServerMsg.parse({ ...message, jobId, seq });
    await this.#d.redis.xadd(`job:${jobId}:events`, '*', 'm', JSON.stringify(full));
    return seq;
  }
}
