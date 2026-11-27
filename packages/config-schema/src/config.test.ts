import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCalibrated,
  CONFIG_FILES,
  type ConfigFileName,
  FlagsConfig,
  LangsConfig,
  listUncalibrated,
  loadConfigFile,
  TiersConfig,
} from './index.ts';

const repo = resolve(import.meta.dirname, '../../..');
const configDir = join(repo, 'config');

describe('仓库中的配置文件', () => {
  it.each(Object.keys(CONFIG_FILES) as ConfigFileName[])('config/%s 通过 schema', (name) => {
    expect(() => loadConfigFile(configDir, name)).not.toThrow();
  });

  it('Tier 1 / Tier 2 与主 PRD 5.1 的列表一致（文档即来源）', () => {
    const prd = readFileSync(join(repo, 'docs/prds/prd.md'), 'utf8');
    const tierLine = (label: string) => {
      const line = prd.split('\n').find((l) => l.includes(`**${label}`)) ?? '';
      return [...((line.split('：')[1] ?? '').split('（')[0] ?? '').matchAll(/`([^`]+)`/g)].map(
        (m) => m[1],
      );
    };
    const langs = loadConfigFile(configDir, 'langs.yaml');
    expect(langs.tier1).toEqual(tierLine('Tier 1'));
    expect(langs.tier2).toEqual(tierLine('Tier 2'));
  });

  it('当前未标定的参数都附有依据（供负责人逐项提供）', () => {
    const pending = (['tiers.yaml', 'quotas.yaml'] as const).flatMap((n) =>
      listUncalibrated(loadConfigFile(configDir, n)),
    );
    expect(pending.length).toBeGreaterThan(0);
    for (const p of pending) expect(p.source.length).toBeGreaterThan(0);
  });
});

describe('未标定标记', () => {
  const tiers = () => loadConfigFile(configDir, 'tiers.yaml');

  it('listUncalibrated 给出嵌套路径与依据', () => {
    expect(
      listUncalibrated({
        a: { b: { uncalibrated: true, source: 's' } },
        c: [1, { uncalibrated: true, source: 't' }],
      }),
    ).toEqual([
      { path: 'a.b', source: 's' },
      { path: 'c.1', source: 't' },
    ]);
  });

  it('生产环境拒绝未标定的配置，错误中列出路径', () => {
    expect(() => assertCalibrated('config/tiers.yaml', tiers())).toThrow(/free\.monthlyPoints/);
  });

  it('全部标定后通过', () => {
    const t = tiers();
    const filled = Object.fromEntries(
      Object.entries(t).map(([k, v]) => [
        k,
        { ...v, weights: ['dedupe_spam'], styles: ['solo_radio'], monthlyPoints: 100 },
      ]),
    );
    expect(() => assertCalibrated('config/tiers.yaml', TiersConfig.parse(filled))).not.toThrow();
  });

  it.each([
    ['uncalibrated 为 false', { uncalibrated: false, source: 'x' }],
    ['缺少 source', { uncalibrated: true }],
    ['写成 0', 0],
  ])('非法的取值：%s', (_n, monthlyPoints) => {
    const raw = { ...tiers(), free: { ...tiers().free, monthlyPoints } };
    expect(TiersConfig.safeParse(raw).success).toBe(false);
  });
});

describe('业务约束', () => {
  it('deep 仅 pro 可用', () => {
    const t = loadConfigFile(configDir, 'tiers.yaml');
    const raw = { ...t, plus: { ...t.plus, densities: ['brief', 'deep'] } };
    const result = TiersConfig.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['plus', 'densities']);
  });

  it('语种不能重复出现在两个等级；默认目标语言必须属于 Tier 1/2', () => {
    expect(
      LangsConfig.safeParse({ tier1: ['en-US'], tier2: ['en-US'], fallbackTargetLang: 'en-US' })
        .success,
    ).toBe(false);
    expect(
      LangsConfig.safeParse({ tier1: ['en-US'], tier2: [], fallbackTargetLang: 'fr-CA' }).success,
    ).toBe(false);
  });

  it('下发给客户端的开关必须是布尔值', () => {
    const flag = (value: unknown) => ({
      flags: { 'site.rules': { description: 'x', default: value, runtime: true, client: true } },
    });
    expect(FlagsConfig.safeParse(flag(true)).success).toBe(true);
    expect(FlagsConfig.safeParse(flag(['a'])).success).toBe(false);
  });

  it('开关键名必须是点分小驼峰', () => {
    expect(
      FlagsConfig.safeParse({
        flags: { 'Jobs-Paused': { description: 'x', default: false, runtime: true } },
      }).success,
    ).toBe(false);
  });
});

describe('加载错误带文件名', () => {
  it.each([
    ['YAML 语法错误', 'tier1: [en-US\n'],
    ['schema 不符', 'tier1: []\ntier2: []\nfallbackTargetLang: en-US\n'],
  ])('%s', (_n, text) => {
    const dir = mkdtempSync(join(tmpdir(), 'config-'));
    writeFileSync(join(dir, 'langs.yaml'), text);
    expect(() => loadConfigFile(dir, 'langs.yaml')).toThrow(/langs\.yaml/);
  });
});
