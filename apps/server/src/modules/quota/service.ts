/**
 * quota 模块（02 §5.3、§9）：precheck / remaining、grant、settleCall（两层计量 + 折算 + 原子核销，一个事务）、refund。受保护路径（计费）。
 * 费率系数与渠道单价是数据（config/credit-rates/<region>.yaml、config/vendors/pricing/<region>.yaml），由调用方注入；
 * 找不到系数或单价时拒绝结算（失败即关闭：不按 0 点或 0 成本记账）。
 */
import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { newId } from '../../platform/id.ts';
import {
  quotaBalances,
  quotaLedger,
  type UsageUnit,
  vendorUsage,
  vendorUsageItems,
} from './schema.ts';

type Db = PostgresJsDatabase;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface UsageItem {
  unit: UsageUnit;
  qty: number;
}

/** 费率系数：每个计价单位折算多少毫点（可为小数，折算后向上取整） */
export interface RateBook {
  rateMc(rateVersion: string, channel: string, unit: UsageUnit): number | undefined;
}

/** 渠道单价：每个计价单位多少微单位成本 */
export interface PriceBook {
  price(
    channel: string,
  ): { version: string; unitMicros(unit: UsageUnit): number | undefined } | undefined;
}

export class MissingRateError extends Error {
  constructor(what: string) {
    super(`缺少${what}，拒绝结算`);
    this.name = 'MissingRateError';
  }
}

export class NoActivePeriodError extends Error {
  constructor() {
    super('用户没有生效中的账期，拒绝结算');
    this.name = 'NoActivePeriodError';
  }
}

export interface SettleInput {
  /** 机审、台架等不计入额度的调用为 null */
  userId: string | null;
  jobId: string;
  stage: string;
  seq: number;
  channel: string;
  billable: boolean;
  items: UsageItem[];
  /** 容错切换时的主渠道 */
  failoverFrom?: string;
  /** 同一请求按主渠道计价单位估算的用量（容错不加价，02 §9.2）；failoverFrom 存在时必填 */
  primaryEquivalentItems?: UsageItem[];
}

export type SettleResult =
  | { duplicated: true }
  | { duplicated: false; chargedMc: number; remainingMc: number | undefined };

export interface QuotaDeps {
  db: Db;
  rates: RateBook;
  prices: PriceBook;
  now?: () => Date;
}

export class QuotaService {
  readonly #d: QuotaDeps;

  constructor(deps: QuotaDeps) {
    this.#d = deps;
  }

  #now() {
    return this.#d.now?.() ?? new Date();
  }

  async #currentPeriod(tx: Db | Tx, userId: string, lock: boolean) {
    const now = this.#now();
    const query = tx
      .select()
      .from(quotaBalances)
      .where(
        and(
          eq(quotaBalances.userId, userId),
          lte(quotaBalances.periodStart, now),
          gt(quotaBalances.periodEnd, now),
        ),
      );
    const [row] = lock ? await query.for('update') : await query;
    return row;
  }

  /** 本期剩余毫点；没有生效中的账期时为 undefined */
  async remaining(userId: string): Promise<number | undefined> {
    const period = await this.#currentPeriod(this.#d.db, userId, false);
    return period ? period.grantedMc - period.usedMc : undefined;
  }

  /** 发起前只检查余额 > 0（软着陆，02 §9.3）；满足 jobs 模块的 QuotaPrecheck */
  async hasBalance(userId: string): Promise<boolean> {
    return ((await this.remaining(userId)) ?? 0) > 0;
  }

  /** 发放一个账期（幂等：同一用户同一账期只发一次）；rateVersion 在此固定 */
  async grant(
    userId: string,
    period: { start: Date; end: Date; grantedMc: number; rateVersion: string },
  ): Promise<boolean> {
    return this.#d.db.transaction(async (tx) => {
      const rows = await tx
        .insert(quotaBalances)
        .values({
          userId,
          periodStart: period.start,
          periodEnd: period.end,
          grantedMc: period.grantedMc,
          rateVersion: period.rateVersion,
        })
        .onConflictDoNothing()
        .returning({ userId: quotaBalances.userId });
      if (rows.length === 0) return false;
      await tx.insert(quotaLedger).values({
        id: newId(),
        userId,
        periodStart: period.start,
        deltaMc: period.grantedMc,
        reason: 'grant',
        rateVersion: period.rateVersion,
        idempotencyKey: `grant:${userId}:${period.start.toISOString()}`,
      });
      return true;
    });
  }

  #chargeMc(rateVersion: string, channel: string, items: UsageItem[]): number {
    return items.reduce((sum, item) => {
      const rate = this.#d.rates.rateMc(rateVersion, channel, item.unit);
      if (rate === undefined)
        throw new MissingRateError(`费率系数 ${rateVersion}/${channel}/${item.unit}`);
      return sum + Math.ceil(item.qty * rate);
    }, 0);
  }

  /** 02 §9.2：一次厂商调用的原始用量 + 成本 + 折算 + 核销，一个事务；同一 (jobId, stage, seq) 只核销一次 */
  async settleCall(input: SettleInput): Promise<SettleResult> {
    const price = this.#d.prices.price(input.channel);
    if (!price) throw new MissingRateError(`渠道单价 ${input.channel}`);
    const costMicros = input.items.reduce((sum, item) => {
      const unit = price.unitMicros(item.unit);
      if (unit === undefined) throw new MissingRateError(`渠道单价 ${input.channel}/${item.unit}`);
      return sum + Math.round(item.qty * unit);
    }, 0);
    if (input.failoverFrom && !input.primaryEquivalentItems)
      throw new Error('容错切换的结算必须提供 primaryEquivalentItems');

    return this.#d.db.transaction(async (tx) => {
      const usageId = newId();
      const [usage] = await tx
        .insert(vendorUsage)
        .values({
          id: usageId,
          idempotencyKey: `usage:${input.jobId}:${input.stage}:${input.seq}`,
          jobId: input.jobId,
          stage: input.stage,
          seq: input.seq,
          channel: input.channel,
          failoverFrom: input.failoverFrom ?? null,
          priceVersion: price.version,
          costMicros,
          billable: input.billable,
        })
        .onConflictDoNothing()
        .returning({ id: vendorUsage.id });
      if (!usage) return { duplicated: true } as const;
      if (input.items.length > 0)
        await tx.insert(vendorUsageItems).values(input.items.map((i) => ({ usageId, ...i })));
      if (!input.billable || !input.userId)
        return { duplicated: false, chargedMc: 0, remainingMc: undefined } as const;

      // 行锁串行化同一账户的核销
      const period = await this.#currentPeriod(tx, input.userId, true);
      if (!period) throw new NoActivePeriodError();
      let mc = this.#chargeMc(period.rateVersion, input.channel, input.items);
      if (input.failoverFrom) {
        // 容错不加价：与主渠道的等价用量相比取较低值
        const primary = this.#chargeMc(
          period.rateVersion,
          input.failoverFrom,
          input.primaryEquivalentItems as UsageItem[],
        );
        mc = Math.min(mc, primary);
      }
      await tx.insert(quotaLedger).values({
        id: newId(),
        userId: input.userId,
        periodStart: period.periodStart,
        deltaMc: -mc,
        reason: 'debit',
        usageId,
        rateVersion: period.rateVersion,
        idempotencyKey: `debit:${input.jobId}:${input.stage}:${input.seq}`,
      });
      const [balance] = await tx
        .update(quotaBalances)
        .set({ usedMc: sql`${quotaBalances.usedMc} + ${mc}` })
        .where(
          and(
            eq(quotaBalances.userId, input.userId),
            eq(quotaBalances.periodStart, period.periodStart),
          ),
        )
        .returning();
      return {
        duplicated: false,
        chargedMc: mc,
        remainingMc: balance ? balance.grantedMc - balance.usedMc : undefined,
      } as const;
    });
  }

  /**
   * 退还（02 §9.3、§18.2）：为任务中匹配的扣减各写一条反向流水，退回扣减时所在的账期；底层用量与成本不改。
   * 完整性失败：stages = 翻译与语音合成、seq = 该单元；任务失败：不限 stages 与 seq。幂等键 refund:{jobId}:{stage}:{seq}。
   */
  async refund(input: { jobId: string; stages?: string[]; seq?: number }): Promise<number> {
    return this.#d.db.transaction(async (tx) => {
      const debits = await tx
        .select({
          userId: quotaLedger.userId,
          periodStart: quotaLedger.periodStart,
          deltaMc: quotaLedger.deltaMc,
          usageId: quotaLedger.usageId,
          rateVersion: quotaLedger.rateVersion,
          stage: vendorUsage.stage,
          seq: vendorUsage.seq,
        })
        .from(quotaLedger)
        .innerJoin(vendorUsage, eq(quotaLedger.usageId, vendorUsage.id))
        .where(
          and(
            eq(quotaLedger.reason, 'debit'),
            eq(vendorUsage.jobId, input.jobId),
            input.stages ? inArray(vendorUsage.stage, input.stages) : undefined,
            input.seq === undefined ? undefined : eq(vendorUsage.seq, input.seq),
          ),
        );
      let refunded = 0;
      for (const debit of debits) {
        const amount = -debit.deltaMc;
        // 先锁余额行，再写流水，与 settleCall 的加锁顺序一致
        await tx
          .select({ userId: quotaBalances.userId })
          .from(quotaBalances)
          .where(
            and(
              eq(quotaBalances.userId, debit.userId),
              eq(quotaBalances.periodStart, debit.periodStart),
            ),
          )
          .for('update');
        const rows = await tx
          .insert(quotaLedger)
          .values({
            id: newId(),
            userId: debit.userId,
            periodStart: debit.periodStart,
            deltaMc: amount,
            reason: 'refund',
            usageId: debit.usageId,
            rateVersion: debit.rateVersion,
            idempotencyKey: `refund:${input.jobId}:${debit.stage}:${debit.seq}`,
          })
          .onConflictDoNothing()
          .returning({ id: quotaLedger.id });
        if (rows.length === 0) continue;
        await tx
          .update(quotaBalances)
          .set({ usedMc: sql`${quotaBalances.usedMc} - ${amount}` })
          .where(
            and(
              eq(quotaBalances.userId, debit.userId),
              eq(quotaBalances.periodStart, debit.periodStart),
            ),
          );
        refunded += amount;
      }
      return refunded;
    });
  }
}
