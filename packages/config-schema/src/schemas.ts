/**
 * config/ 的 schema（00 §5；默认值落点见 02 §21）。本卡覆盖 langs、tiers、quotas、flags 四个文件（P1-CTR-04）。
 */
import { Density, LangTag, Style, Tier, Weight } from '@post-reader/contracts';
import { z } from 'zod';
import { calibrated } from './calibration.ts';

const PositiveInt = z.int().positive();
const NonNegativeInt = z.int().nonnegative();
const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;

/** langs.yaml：播报语言等级（主 PRD 5.1）；Tier 3 = 不在两表中的其余语种，禁止作为目标发音语言 */
export const LangsConfig = z
  .object({
    tier1: z.array(LangTag).min(1),
    tier2: z.array(LangTag),
    /** 系统区域不在 Tier 1/2 中时的默认 target_lang（主 PRD 5.2.1） */
    fallbackTargetLang: LangTag,
  })
  .superRefine((c, ctx) => {
    const all = [...c.tier1, ...c.tier2];
    if (!unique(all))
      ctx.addIssue({ code: 'custom', path: ['tier2'], message: '同一语种不能同时出现在多个等级' });
    if (!all.includes(c.fallbackTargetLang)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackTargetLang'],
        message: '默认目标语言必须属于 Tier 1 或 Tier 2',
      });
    }
  });
export type LangsConfig = z.infer<typeof LangsConfig>;

const TierEntitlement = z.object({
  densities: z.array(Density).min(1).refine(unique, '不能重复'),
  weights: calibrated(z.array(Weight).refine(unique, '不能重复')),
  styles: calibrated(z.array(Style).min(1).refine(unique, '不能重复')),
  /** 月度统一额度池 Q_*（点/月） */
  monthlyPoints: calibrated(PositiveInt),
});

/** tiers.yaml：档位权益（主 PRD 11.1）；`deep` 仅 pro（00 §3.1） */
export const TiersConfig = z
  .object(
    Object.fromEntries(Tier.options.map((t) => [t, TierEntitlement])) as Record<
      Tier,
      typeof TierEntitlement
    >,
  )
  .superRefine((c, ctx) => {
    for (const tier of ['free', 'plus'] as const) {
      if (c[tier].densities.includes('deep')) {
        ctx.addIssue({ code: 'custom', path: [tier, 'densities'], message: 'deep 仅 pro 可用' });
      }
    }
  });
export type TiersConfig = z.infer<typeof TiersConfig>;

const TokenBucket = z.object({ capacity: PositiveInt, refillPerSecond: z.number().positive() });

/** quotas.yaml：额度与限流（02 §11.3、§21、§23） */
export const QuotasConfig = z.object({
  reset: z.enum(['calendar_month']),
  sharedCacheCharge: z.enum(['by_duration']),
  lowQuotaWarning: z.boolean(),
  negativeBalance: z.enum(['keep_in_period_no_carryover']),
  chargeModeration: z.boolean(),
  compensation: z.object({
    maxPerGrantPoints: PositiveInt,
    /** 每个后台账号每日 */
    maxDailyPoints: PositiveInt,
    /** null = 不设上限 */
    batchTotalCap: PositiveInt.nullable(),
  }),
  /** R_daily：单账号每日采编与重新生成次数上限（主 PRD 11.2） */
  dailyJobLimit: calibrated(PositiveInt),
  tokenBuckets: z.object({ user: calibrated(TokenBucket), ip: calibrated(TokenBucket) }),
  emailCode: z.object({
    cooldownSeconds: PositiveInt,
    verifyMaxAttempts: PositiveInt,
    verifyWindowSeconds: PositiveInt,
  }),
  /** POST /jobs 服务端校验（02 §4.2） */
  limits: z.object({ maxComments: PositiveInt, maxUnitChars: PositiveInt }),
  /** 单篇上限（主 PRD U25，02 §23.2）；正式值由台架标定后经 PR 生效 */
  postMaxChars: PositiveInt,
  postMaxPoints: z.object(
    Object.fromEntries(Tier.options.map((t) => [t, PositiveInt])) as Record<
      Tier,
      typeof PositiveInt
    >,
  ),
  /** 每次「继续生成」放宽一档：放宽量 = 本档位的单篇上限 */
  extendStep: z.enum(['same_as_tier_cap']),
  billingTz: z.object({ changeCooldownDays: NonNegativeInt }),
});
export type QuotasConfig = z.infer<typeof QuotasConfig>;

const FlagValue = z.union([z.boolean(), z.array(z.string())]);

/** flags.yaml：特性开关；`runtime: true` 的开关可由后台运行时覆盖（02 §18.1） */
export const FlagsConfig = z.object({
  flags: z.record(
    z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/, '键名用点分小驼峰，例如 jobs.paused'),
    z
      .object({
        description: z.string().min(1),
        default: FlagValue,
        runtime: z.boolean(),
        /** 是否经 GET /me 的 flags 下发给客户端（只有布尔开关可以下发） */
        client: z.boolean().default(false),
      })
      .refine((f) => !f.client || typeof f.default === 'boolean', {
        error: '下发给客户端的开关必须是布尔值（GET /me 的 flags 为 Record<string, boolean>）',
        path: ['client'],
      }),
  ),
});
export type FlagsConfig = z.infer<typeof FlagsConfig>;

export const CONFIG_FILES = {
  'langs.yaml': LangsConfig,
  'tiers.yaml': TiersConfig,
  'quotas.yaml': QuotasConfig,
  'flags.yaml': FlagsConfig,
} as const;
