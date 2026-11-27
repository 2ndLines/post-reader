/**
 * 统一额度池的两层计量（02 §9；DDL 见《完整技术架构》§11.2）。受保护路径（计费）。
 * - 底层：vendor_usage（每次厂商调用，不含用户 ID）与 vendor_usage_items（各计价单位的原始用量）
 * - 用户侧：quota_balances（每账期一行，毫点）与 quota_ledger（只追加的流水）
 * 偏离《完整技术架构》§11.2：暂不按月分区，幂等键用普通唯一约束直接保证（分区表的唯一约束必须含分区键，
 * 分区之后改为 Redis + 当月分区内唯一的两层保障）。分区与保留期任务在 P3 之后（P3-SRV-04 R1）。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/schema.ts';

export const USAGE_UNITS = [
  'in_tokens',
  'out_tokens',
  'cached_in_tokens',
  'chars_10k',
  'speech_tokens',
  'audio_s',
] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

export const vendorUsage = pgTable('vendor_usage', {
  id: uuid('id').primaryKey(),
  /** usage:{jobId}:{stage}:{seq} */
  idempotencyKey: text('idempotency_key').notNull().unique(),
  /** 不设外键：任务 30 天后删除，用量保留 13 个月 */
  jobId: uuid('job_id'),
  /** select / translate / tts / cache_hit / moderation … */
  stage: text('stage').notNull(),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  /** 区域.厂商.模型.线路 */
  channel: text('channel').notNull(),
  failoverFrom: text('failover_from'),
  priceVersion: text('price_version').notNull(),
  /** 本区币种微单位 */
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull(),
  billable: boolean('billable').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vendorUsageItems = pgTable(
  'vendor_usage_items',
  {
    usageId: uuid('usage_id')
      .notNull()
      .references(() => vendorUsage.id, { onDelete: 'cascade' }),
    unit: text('unit', { enum: USAGE_UNITS }).notNull(),
    qty: numeric('qty', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.usageId, t.unit] }),
    check(
      'vendor_usage_items_unit',
      sql`${t.unit} in ('in_tokens','out_tokens','cached_in_tokens','chars_10k','speech_tokens','audio_s')`,
    ),
  ],
);

export const quotaBalances = pgTable(
  'quota_balances',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    grantedMc: bigint('granted_mc', { mode: 'number' }).notNull(),
    /** 可大于 granted_mc（负余额，下期不追扣，主 PRD U18） */
    usedMc: bigint('used_mc', { mode: 'number' }).notNull().default(0),
    /** 账期开始时固定的费率系数版本 */
    rateVersion: text('rate_version').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.periodStart] })],
);

export const quotaLedger = pgTable(
  'quota_ledger',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    /** 扣减为负，发放 / 退还 / 补偿为正 */
    deltaMc: bigint('delta_mc', { mode: 'number' }).notNull(),
    reason: text('reason', { enum: ['grant', 'debit', 'refund', 'compensation'] }).notNull(),
    /** 扣减与退还关联到底层一次调用 */
    usageId: uuid('usage_id').references(() => vendorUsage.id),
    rateVersion: text('rate_version'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('quota_ledger_reason', sql`${t.reason} in ('grant','debit','refund','compensation')`),
  ],
);
