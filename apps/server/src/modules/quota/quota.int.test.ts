/**
 * 统一额度池（P3-SRV-04，02 §9）。真实 PostgreSQL。费率系数与单价是测试数据（渠道名虚构），不是标定值。
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { newId } from '../../platform/id.ts';
import { users } from '../auth/schema.ts';
import type { JobsDeps } from '../jobs/service.ts';
import { quotaBalances, quotaLedger, vendorUsage, vendorUsageItems } from './schema.ts';
import {
  MissingRateError,
  NoActivePeriodError,
  type PriceBook,
  QuotaService,
  type RateBook,
} from './service.ts';

const RATES: Record<string, Record<string, number>> = {
  // 锚定示例（02 §9.2）：60 s ≈ 1000 mc
  'test.tts.primary': { audio_s: 16.667 },
  'test.tts.backup': { chars_10k: 30_000 },
  'test.llm.primary': { in_tokens: 0.01, out_tokens: 0.05 },
};
const rates: RateBook = {
  rateMc: (version, channel, unit) => (version === 'r1' ? RATES[channel]?.[unit] : undefined),
};
const prices: PriceBook = {
  price: (channel) =>
    channel.startsWith('test.')
      ? {
          version: 'p1',
          unitMicros: (unit) =>
            ({ audio_s: 50, chars_10k: 90_000, in_tokens: 1, out_tokens: 4 })[unit as string],
        }
      : undefined,
};

let t: Awaited<ReturnType<typeof createTestDatabase>>;
let quota: QuotaService;
const now = new Date('2026-11-27T10:00:00Z');
const period = {
  start: new Date('2026-11-01T00:00:00Z'),
  end: new Date('2026-12-01T00:00:00Z'),
  grantedMc: 10_000,
  rateVersion: 'r1',
};

async function newUser(): Promise<string> {
  const id = newId();
  await t.db.insert(users).values({ id, homeRegion: 'intl', billingTz: 'UTC' });
  return id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  quota = new QuotaService({ db: t.db, rates, prices, now: () => now });
}, 60_000);

afterAll(async () => {
  await t?.drop();
});

const tts = (userId: string | null, jobId: string, seq: number, audioS: number) =>
  quota.settleCall({
    userId,
    jobId,
    stage: 'tts',
    seq,
    channel: 'test.tts.primary',
    billable: true,
    items: [{ unit: 'audio_s', qty: audioS }],
  });

describe('发放与预检', () => {
  it('没有账期：余额未知，预检不通过；发放后有余额；同一账期重复发放无效', async () => {
    const u = await newUser();
    expect(await quota.remaining(u)).toBeUndefined();
    expect(await quota.hasBalance(u)).toBe(false);
    expect(await quota.grant(u, period)).toBe(true);
    expect(await quota.grant(u, period)).toBe(false);
    expect(await quota.remaining(u)).toBe(10_000);
    expect(await quota.hasBalance(u)).toBe(true);
    const ledger = await t.db.select().from(quotaLedger).where(eq(quotaLedger.userId, u));
    expect(ledger.map((l) => [l.reason, l.deltaMc])).toEqual([['grant', 10_000]]);
  });

  it('QuotaService 满足 jobs 模块的额度预检接口（POST /jobs 用它判断 QUOTA_EXHAUSTED）', () => {
    const precheck: JobsDeps['quota'] = quota;
    expect(typeof precheck.hasBalance).toBe('function');
  });
});

describe('settleCall（02 §9.2）', () => {
  it('底层记原始用量与成本，用户侧按本期系数折算并向上取整；余额同步减少', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const jobId = newId();
    const result = await tts(u, jobId, 1, 60);
    // 60 × 16.667 = 1000.02 → 1001
    expect(result).toEqual({ duplicated: false, chargedMc: 1001, remainingMc: 8999 });
    const [usage] = await t.db.select().from(vendorUsage).where(eq(vendorUsage.jobId, jobId));
    expect(usage).toMatchObject({
      stage: 'tts',
      seq: 1,
      channel: 'test.tts.primary',
      priceVersion: 'p1',
      costMicros: 3000,
      billable: true,
    });
    expect(Object.keys(usage ?? {})).not.toContain('userId');
    const items = await t.db
      .select()
      .from(vendorUsageItems)
      .where(eq(vendorUsageItems.usageId, usage?.id as string));
    expect(items).toEqual([{ usageId: usage?.id, unit: 'audio_s', qty: 60 }]);
  });

  it('同一 (jobId, stage, seq) 重复上报只核销一次', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const jobId = newId();
    await tts(u, jobId, 1, 6);
    expect(await tts(u, jobId, 1, 6)).toEqual({ duplicated: true });
    expect(await quota.remaining(u)).toBe(10_000 - Math.ceil(6 * 16.667));
  });

  it('一次调用多项计价单位（文本生成的输入与输出 Token）分别折算后相加', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const r = await quota.settleCall({
      userId: u,
      jobId: newId(),
      stage: 'select',
      seq: 0,
      channel: 'test.llm.primary',
      billable: true,
      items: [
        { unit: 'in_tokens', qty: 1234 },
        { unit: 'out_tokens', qty: 321 },
      ],
    });
    // ceil(12.34) + ceil(16.05) = 13 + 17
    expect(r).toMatchObject({ chargedMc: 30 });
  });

  it('不计入额度（billable = false）或没有用户：只写底层，不写流水', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const jobId = newId();
    await quota.settleCall({
      userId: u,
      jobId,
      stage: 'moderation',
      seq: 0,
      channel: 'test.llm.primary',
      billable: false,
      items: [{ unit: 'in_tokens', qty: 500 }],
    });
    await quota.settleCall({
      userId: null,
      jobId,
      stage: 'testbench',
      seq: 0,
      channel: 'test.llm.primary',
      billable: true,
      items: [{ unit: 'in_tokens', qty: 500 }],
    });
    expect(await t.db.select().from(vendorUsage).where(eq(vendorUsage.jobId, jobId))).toHaveLength(
      2,
    );
    expect(
      (await t.db.select().from(quotaLedger).where(eq(quotaLedger.userId, u))).map((l) => l.reason),
    ).toEqual(['grant']);
    expect(await quota.remaining(u)).toBe(10_000);
  });

  it('容错不加价：备用渠道折算更贵时，按主渠道的等价用量计', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const r = await quota.settleCall({
      userId: u,
      jobId: newId(),
      stage: 'tts',
      seq: 1,
      channel: 'test.tts.backup',
      billable: true,
      items: [{ unit: 'chars_10k', qty: 0.1 }], // 备用：3000 mc
      failoverFrom: 'test.tts.primary',
      primaryEquivalentItems: [{ unit: 'audio_s', qty: 60 }], // 主渠道：1001 mc
    });
    expect(r).toMatchObject({ chargedMc: 1001 });
  });

  it('软着陆：余额 > 0 时发起，结算后可以为负；之后预检不通过', async () => {
    const u = await newUser();
    await quota.grant(u, { ...period, grantedMc: 500 });
    expect(await tts(u, newId(), 1, 60)).toMatchObject({ remainingMc: 500 - 1001 });
    expect(await quota.hasBalance(u)).toBe(false);
  });

  it('并发：同一账户 20 次并发结算，余额 = 发放 − Σ扣减（行锁串行化）', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const jobId = newId();
    await Promise.all(Array.from({ length: 20 }, (_, i) => tts(u, jobId, i, 3)));
    const per = Math.ceil(3 * 16.667);
    expect(await quota.remaining(u)).toBe(10_000 - 20 * per);
    const ledger = await t.db.select().from(quotaLedger).where(eq(quotaLedger.userId, u));
    expect(ledger.reduce((s, l) => s + l.deltaMc, 0)).toBe(10_000 - 20 * per);
  });

  it('找不到系数或单价、没有生效中的账期：拒绝结算，什么都不写', async () => {
    const u = await newUser();
    const jobId = newId();
    await expect(tts(u, jobId, 1, 1)).rejects.toBeInstanceOf(NoActivePeriodError);
    await quota.grant(u, period);
    await expect(
      quota.settleCall({
        userId: u,
        jobId,
        stage: 'tts',
        seq: 2,
        channel: 'test.llm.primary',
        billable: true,
        items: [{ unit: 'audio_s', qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(MissingRateError);
    await expect(
      quota.settleCall({
        userId: u,
        jobId,
        stage: 'tts',
        seq: 3,
        channel: 'unknown.channel',
        billable: true,
        items: [{ unit: 'audio_s', qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(MissingRateError);
    expect(await t.db.select().from(vendorUsage).where(eq(vendorUsage.jobId, jobId))).toHaveLength(
      0,
    );
    expect(await quota.remaining(u)).toBe(10_000);
  });
});

describe('refund（02 §9.3、§18.2）', () => {
  it('完整性失败：只退该单元的翻译与语音合成，文本生成不退；重复退还无效', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const jobId = newId();
    await quota.settleCall({
      userId: u,
      jobId,
      stage: 'select',
      seq: 0,
      channel: 'test.llm.primary',
      billable: true,
      items: [{ unit: 'out_tokens', qty: 1000 }],
    });
    await tts(u, jobId, 5, 60);
    await tts(u, jobId, 6, 60);
    const before = (await quota.remaining(u)) as number;
    expect(await quota.refund({ jobId, stages: ['translate', 'tts', 'tts_neural'], seq: 5 })).toBe(
      1001,
    );
    expect(await quota.refund({ jobId, stages: ['translate', 'tts', 'tts_neural'], seq: 5 })).toBe(
      0,
    );
    expect(await quota.remaining(u)).toBe(before + 1001);
  });

  it('任务失败：该任务全部扣减都退还；底层用量与成本不变', async () => {
    const u = await newUser();
    await quota.grant(u, period);
    const jobId = newId();
    await quota.settleCall({
      userId: u,
      jobId,
      stage: 'select',
      seq: 0,
      channel: 'test.llm.primary',
      billable: true,
      items: [{ unit: 'out_tokens', qty: 1000 }],
    });
    await tts(u, jobId, 1, 60);
    const usageBefore = await t.db.select().from(vendorUsage).where(eq(vendorUsage.jobId, jobId));
    expect(await quota.refund({ jobId })).toBe(50 + 1001);
    expect(await quota.remaining(u)).toBe(10_000);
    expect(await t.db.select().from(vendorUsage).where(eq(vendorUsage.jobId, jobId))).toEqual(
      usageBefore,
    );
    const [balance] = await t.db.select().from(quotaBalances).where(eq(quotaBalances.userId, u));
    const ledger = await t.db.select().from(quotaLedger).where(eq(quotaLedger.userId, u));
    // 对账口径（02 §9.2）：余额 = 发放 − Σ流水
    expect((balance?.grantedMc ?? 0) - (balance?.usedMc ?? 0)).toBe(
      ledger.reduce((s, l) => s + l.deltaMc, 0),
    );
  });
});
