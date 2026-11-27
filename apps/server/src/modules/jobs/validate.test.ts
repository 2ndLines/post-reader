import { resolve } from 'node:path';
import { loadConfigFile } from '@post-reader/config-schema';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../platform/http/errors.ts';
import { syntheticJobRequest } from './test-post.ts';
import { resolveEntitlements, type ValidationContext, validateCreateJob } from './validate.ts';

const configDir = resolve(import.meta.dirname, '../../../../../config');
const tiers = loadConfigFile(configDir, 'tiers.yaml');
const langs = loadConfigFile(configDir, 'langs.yaml');
const quotas = loadConfigFile(configDir, 'quotas.yaml');

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  tier: 'pro',
  entitlements: resolveEntitlements(tiers, 'test').entitlements,
  limits: quotas.limits,
  langs,
  publicSites: new Set(),
  ...over,
});

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  const { code, status, detail } = error as AppError;
  return { code, status, detail };
}

describe('POST /jobs 校验清单（02 §4.2）', () => {
  it('合法请求通过；PRIVATE 保持 PRIVATE', async () => {
    expect(await validateCreateJob(await syntheticJobRequest(), ctx())).toEqual({
      cacheScope: 'PRIVATE',
      readMode: 'translated',
    });
  });

  it('1 单元数：主帖 + maxComments 条评论可以，再多一条拒绝', async () => {
    const limits = { maxComments: 3, maxUnitChars: 8000 };
    await expect(
      validateCreateJob(await syntheticJobRequest({}, 3), ctx({ limits })),
    ).resolves.toBeDefined();
    expect(
      await rejection(validateCreateJob(await syntheticJobRequest({}, 4), ctx({ limits }))),
    ).toEqual({
      code: 'VALIDATION_FAILED',
      status: 400,
      detail: 'post.units',
    });
  });

  it('1 单单元长度按码点计：上限内的 emoji 不因 UTF-16 长度被拒绝', async () => {
    const req = await syntheticJobRequest();
    const limits = { maxComments: 80, maxUnitChars: 4 };
    const { unitHash } = await import('@post-reader/canonical-spec');
    const c1 = req.post.units[1] as (typeof req.post.units)[number];
    c1.cleanText = '😀😀😀😀';
    c1.hash = await unitHash(c1.unitId, c1.authorId, c1.cleanText);
    const p = req.post.units[0] as (typeof req.post.units)[number];
    p.cleanText = '短';
    p.hash = await unitHash(p.unitId, p.authorId, p.cleanText);
    req.post.units = [p, c1];
    await expect(validateCreateJob(req, ctx({ limits }))).resolves.toBeDefined();
    c1.cleanText = '😀😀😀😀😀';
    c1.hash = await unitHash(c1.unitId, c1.authorId, c1.cleanText);
    expect((await rejection(validateCreateJob(req, ctx({ limits })))).detail).toBe(
      'post.units.1.cleanText',
    );
  });

  it('2 摘要不符：VALIDATION_FAILED，指出第几个单元', async () => {
    const req = await syntheticJobRequest();
    (req.post.units[2] as { cleanText: string }).cleanText += '（被改过）';
    expect(await rejection(validateCreateJob(req, ctx()))).toEqual({
      code: 'VALIDATION_FAILED',
      status: 400,
      detail: 'post.units.2.hash',
    });
  });

  it('3 档位：free 不能用 deep；不在档位列表中的 style 与 weights 被拒绝', async () => {
    const deep = await syntheticJobRequest({
      prefs: { density: 'deep', weights: [], style: 'solo_radio' },
    });
    expect(await rejection(validateCreateJob(deep, ctx({ tier: 'free' })))).toEqual({
      code: 'TIER_REQUIRED',
      status: 403,
      detail: 'prefs.density',
    });
    const entitlements = {
      ...ctx().entitlements,
      plus: {
        densities: new Set(['brief', 'standard'] as const),
        weights: new Set(['dedupe_spam'] as const),
        styles: new Set(['solo_radio'] as const),
      },
    };
    const style = await syntheticJobRequest({
      prefs: { density: 'standard', weights: [], style: 'fireside' },
    });
    expect(
      (await rejection(validateCreateJob(style, ctx({ tier: 'plus', entitlements })))).detail,
    ).toBe('prefs.style');
    const weights = await syntheticJobRequest({
      prefs: { density: 'standard', weights: ['op_replies'], style: 'solo_radio' },
    });
    expect(
      (await rejection(validateCreateJob(weights, ctx({ tier: 'plus', entitlements })))).detail,
    ).toBe('prefs.weights');
  });

  it('4 PUBLIC 只允许白名单站点，否则改为 PRIVATE', async () => {
    const req = await syntheticJobRequest();
    req.post.source.cacheScope = 'PUBLIC';
    expect((await validateCreateJob(req, ctx())).cacheScope).toBe('PRIVATE');
    expect(
      (await validateCreateJob(req, ctx({ publicSites: new Set(['example-forum']) }))).cacheScope,
    ).toBe('PUBLIC');
  });

  it('5 目标语言与直通语言只能是 Tier 1 / 2；源语种为 Tier 3 时忽略 original', async () => {
    expect(
      (
        await rejection(
          validateCreateJob(await syntheticJobRequest({ targetLang: 'sw-KE' }), ctx()),
        )
      ).detail,
    ).toBe('targetLang');
    expect(
      (
        await rejection(
          validateCreateJob(
            await syntheticJobRequest({ passthroughLangs: ['en-US', 'sw-KE'] }),
            ctx(),
          ),
        )
      ).detail,
    ).toBe('passthroughLangs.1');
    const tier3 = await syntheticJobRequest({ readMode: 'original' });
    tier3.post.langHint = 'sw-KE';
    expect((await validateCreateJob(tier3, ctx())).readMode).toBe('translated');
    tier3.post.langHint = 'ja-JP';
    expect((await validateCreateJob(tier3, ctx())).readMode).toBe('original');
  });
});

describe('resolveEntitlements', () => {
  it('仓库中的 tiers.yaml 仍有未标定项：生产环境拒绝，并列出', () => {
    expect(() => resolveEntitlements(tiers, 'production')).toThrow('free.weights');
  });

  it('非生产环境：未标定项不限制，并列出；已标定项照常限制', () => {
    const { entitlements, unrestricted } = resolveEntitlements(tiers, 'development');
    expect(unrestricted).toEqual(['free.weights', 'free.styles', 'plus.weights', 'plus.styles']);
    expect(entitlements.free.weights).toBeNull();
    expect(entitlements.pro.styles?.has('fireside')).toBe(true);
    expect(entitlements.free.densities.has('deep')).toBe(false);
  });
});
