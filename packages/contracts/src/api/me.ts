/** /me、/quota/reference、DELETE /account（02 §4.2、§23.1） */
import { z } from 'zod';
import { Density, Region, Style, Tier, UtcDateTime } from '../common.ts';

export const QuotaSummary = z.object({
  /** 统一额度池余额，毫点，可为负（主 PRD U18） */
  remainingMc: z.int(),
  grantedMc: z.int().nonnegative(),
});

export const Me = z.object({
  tier: Tier,
  quota: QuotaSummary.extend({
    resetAt: UtcDateTime,
    /** 本期费率系数版本 */
    rateVersion: z.string().min(1),
  }),
  periodEnd: UtcDateTime,
  homeRegion: Region,
  /** IANA 时区；账期与每日次数按此计算（02 §23.1） */
  billingTz: z.string().min(1),
  /** 客户端可见的特性开关 */
  flags: z.record(z.string(), z.boolean()),
  /** 本档位可用的 density 与 style（取值来自 config/tiers.yaml） */
  entitlements: z.object({ densities: z.array(Density), styles: z.array(Style) }),
});

export const UpdateMeRequest = z.object({ billingTz: z.string().min(1) });

/** 参考消耗：按本期 rateVersion 的主渠道系数换算；不返回渠道、厂商与成本 */
export const QuotaReference = z.object({
  rateVersion: z.string().min(1),
  items: z.array(
    z.object({
      category: z.enum(['audio_minute', 'translation_kchar', 'orchestration_ktoken']),
      approxPoints: z.number().nonnegative(),
    }),
  ),
});

export const DeleteAccountResponse = z.object({
  requestId: z.string().min(1),
  deadlineAt: UtcDateTime,
});
