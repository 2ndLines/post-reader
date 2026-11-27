/**
 * 任务相关的表（02 §5.4、§11.1；列清单见《完整技术架构》§11.1）。只写本模块拥有的表（02 §17 第 2 条）。
 * 正文列以 `_enc` 结尾，用用户 DEK 加密（platform/crypto）；任务完成 24 小时后置空，只留摘要（保留期任务，02 §18.6）。
 * `job_segments` 按月分区与 30 天保留由保留期任务实现（P3 之后），本迁移先建普通表。
 */
import type { CacheScope, DegradeReason, LangTag, Prefs } from '@post-reader/contracts';
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/schema.ts';

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => 'bytea' });

export const JOB_STATES = [
  'created',
  'admitted',
  'planning',
  'scripting',
  'synthesizing',
  'completed',
  'rejected',
  'failed',
  'cancelled',
  'quota_exhausted',
] as const;

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 对外随机 128 位标识（00 §4.2）：发往厂商的唯一标识，不是 userId */
    taskId: text('task_id').notNull().unique(),
    /** sha256(site + ":" + postId) 前 32 位 hex（00 §4.2） */
    postKey: text('post_key').notNull(),
    cacheScope: text('cache_scope', { enum: ['PUBLIC', 'PRIVATE'] })
      .$type<CacheScope>()
      .notNull(),
    /** 分支在 planning 阶段确定 */
    branch: text('branch', { enum: ['same_lang', 'translate'] }),
    prefs: jsonb('prefs').$type<Prefs>().notNull(),
    targetLang: text('target_lang').$type<LangTag>().notNull(),
    /** 02 §11.1 节选中没有，流水线需要（P3-SRV-01 计划） */
    readMode: text('read_mode', { enum: ['translated', 'original'] }).notNull(),
    passthroughLangs: jsonb('passthrough_langs').$type<LangTag[]>().notNull(),
    state: text('state', { enum: JOB_STATES }).notNull(),
    degraded: jsonb('degraded').$type<DegradeReason[]>().notNull().default([]),
    idempotencyKey: text('idempotency_key').notNull(),
    /** 原始请求体的 SHA-256：同一幂等键配不同请求体时拒绝 */
    requestSha256: text('request_sha256').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('jobs_user_created').on(t.userId, t.createdAt.desc()),
    uniqueIndex('jobs_user_idem').on(t.userId, t.idempotencyKey),
  ],
);

export const jobUnits = pgTable(
  'job_units',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    unitId: text('unit_id').notNull(),
    authorId: text('author_id').notNull(),
    kind: text('kind', { enum: ['post', 'comment'] }).notNull(),
    parentId: text('parent_id'),
    /** 上报顺序（units 数组下标）；ord 是编排后的播放顺序 */
    position: integer('position').notNull(),
    cleanTextEnc: bytea('clean_text_enc'),
    clientHash: text('client_hash').notNull(),
    /** 送入 TTS 的文本摘要（02 §18.2 完整性核对） */
    serverTextSha256: text('server_text_sha256'),
    ord: integer('ord'),
    emotion: text('emotion'),
    voiceSlot: integer('voice_slot'),
    translatedEnc: bytea('translated_enc'),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.unitId] })],
);

export const jobSegments = pgTable(
  'job_segments',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    unitId: text('unit_id').notNull(),
    objectKey: text('object_key').notNull(),
    audioSha256: text('audio_sha256').notNull(),
    durationMs: integer('duration_ms').notNull(),
    cacheKey: text('cache_key'),
    scope: text('scope', { enum: ['PUBLIC', 'PRIVATE'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.seq] })],
);
