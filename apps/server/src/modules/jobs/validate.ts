/**
 * `POST /jobs` 服务端校验清单（02 §4.2）：
 * 1 单元数与单单元长度上限（quotas.yaml limits）；2 逐单元按 canonical-spec 重算摘要；
 * 3 density / style / weights 的档位权益（tiers.yaml）；4 PUBLIC 只允许白名单站点，否则改为 PRIVATE；
 * 5 targetLang、passthroughLangs 只能是 Tier 1 / Tier 2；源语种为 Tier 3 时忽略 readMode = original。
 * 错误的 detail 只写字段路径，不回显内容（02 §12）。
 */
import { unitHash } from '@post-reader/canonical-spec';
import type { LangsConfig, QuotasConfig, TiersConfig } from '@post-reader/config-schema';
import type {
  CacheScope,
  CreateJobRequest,
  Density,
  Style,
  Tier,
  Weight,
} from '@post-reader/contracts';
import type { z } from 'zod';
import { AppError } from '../../platform/http/errors.ts';

type Request = z.infer<typeof CreateJobRequest>;

/** 已解析的档位权益；null 表示该项未标定、在非生产环境不限制 */
export interface Entitlement {
  densities: ReadonlySet<Density>;
  weights: ReadonlySet<Weight> | null;
  styles: ReadonlySet<Style> | null;
}

/** 生产环境不允许未标定（与 check:config --production 一致）；其他环境不限制该项，并列出 */
export function resolveEntitlements(
  tiers: TiersConfig,
  nodeEnv: string,
): { entitlements: Record<Tier, Entitlement>; unrestricted: string[] } {
  const unrestricted: string[] = [];
  const pick = <T>(tier: Tier, key: 'weights' | 'styles', value: T[] | { uncalibrated: true }) => {
    if (Array.isArray(value)) return new Set(value);
    unrestricted.push(`${tier}.${key}`);
    return null;
  };
  const resolve = (tier: Tier): Entitlement => ({
    densities: new Set(tiers[tier].densities),
    weights: pick(tier, 'weights', tiers[tier].weights),
    styles: pick(tier, 'styles', tiers[tier].styles),
  });
  const entitlements = { free: resolve('free'), plus: resolve('plus'), pro: resolve('pro') };
  if (unrestricted.length > 0 && nodeEnv === 'production') {
    throw new Error(`档位权益未标定，生产环境拒绝启动：${unrestricted.join(', ')}`);
  }
  return { entitlements, unrestricted };
}

export interface ValidationContext {
  tier: Tier;
  entitlements: Record<Tier, Entitlement>;
  limits: QuotasConfig['limits'];
  langs: Pick<LangsConfig, 'tier1' | 'tier2'>;
  /** allowlist.yaml 中的站点（尚未建立时为空集：全部按 PRIVATE） */
  publicSites: ReadonlySet<string>;
}

const invalid = (path: string) => new AppError('VALIDATION_FAILED', 400, path);

/** 校验通过时返回服务端最终采用的 cacheScope 与 readMode */
export async function validateCreateJob(
  input: Request,
  ctx: ValidationContext,
): Promise<{ cacheScope: CacheScope; readMode: Request['readMode'] }> {
  // 1 上限：主帖 + 最多 maxComments 条评论；长度按 Unicode 码点计（P3-SRV-01 Q4）
  if (input.post.units.length > ctx.limits.maxComments + 1) throw invalid('post.units');
  input.post.units.forEach((unit, i) => {
    if ([...unit.cleanText].length > ctx.limits.maxUnitChars)
      throw invalid(`post.units.${i}.cleanText`);
  });

  // 2 摘要重算：直接对上报的 cleanText 计算，不再清洗一次（清洗不是幂等的，P1-SPEC-01 Q7）
  for (const [i, unit] of input.post.units.entries()) {
    if ((await unitHash(unit.unitId, unit.authorId, unit.cleanText)) !== unit.hash)
      throw invalid(`post.units.${i}.hash`);
  }

  // 3 档位权益
  const ent = ctx.entitlements[ctx.tier];
  if (!ent.densities.has(input.prefs.density))
    throw new AppError('TIER_REQUIRED', 403, 'prefs.density');
  if (ent.styles && !ent.styles.has(input.prefs.style))
    throw new AppError('TIER_REQUIRED', 403, 'prefs.style');
  if (ent.weights && input.prefs.weights.some((w) => !ent.weights?.has(w)))
    throw new AppError('TIER_REQUIRED', 403, 'prefs.weights');

  // 5 语种
  const allowed = new Set<string>([...ctx.langs.tier1, ...ctx.langs.tier2]);
  if (!allowed.has(input.targetLang)) throw invalid('targetLang');
  input.passthroughLangs.forEach((lang, i) => {
    if (!allowed.has(lang)) throw invalid(`passthroughLangs.${i}`);
  });

  // 4 共享缓存只允许白名单站点
  const cacheScope: CacheScope =
    input.post.source.cacheScope === 'PUBLIC' && ctx.publicSites.has(input.post.source.site)
      ? 'PUBLIC'
      : 'PRIVATE';
  // 源语种此时只知道站点给的 langHint；没有 langHint 时由流水线的语种判定处理（P3-SRV-01 Q5）
  const tier3Source = input.post.langHint !== undefined && !allowed.has(input.post.langHint);
  const readMode = tier3Source ? 'translated' : input.readMode;
  return { cacheScope, readMode };
}
