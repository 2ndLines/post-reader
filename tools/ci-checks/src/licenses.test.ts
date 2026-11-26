import { describe, expect, it } from 'vitest';
import { classifyLicense, evaluateLicenses, type LicensePolicy } from './licenses.ts';

const policy: LicensePolicy = {
  allowed: ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause'],
  conditional: { 'MPL-2.0': '不修改源文件' },
  exceptions: [{ name: 'k6', license: 'AGPL-3.0', reason: '仅作 CI 命令行工具（05 §2.2）' }],
};

const pkg = (name: string, license: string) => ({ name, versions: ['1.0.0'], license });

describe('classifyLicense', () => {
  it.each([
    ['MIT', 'allowed'],
    ['MIT OR Apache-2.0', 'allowed'],
    ['(MIT OR GPL-3.0)', 'allowed'],
    ['MIT AND ISC', 'allowed'],
    ['MIT AND MPL-2.0', 'conditional'],
    ['MPL-2.0 OR GPL-3.0', 'conditional'],
    ['MIT AND GPL-3.0', 'denied'],
    ['GPL-3.0', 'denied'],
    ['SSPL-1.0', 'denied'],
    ['Unknown', 'denied'],
    ['Apache-2.0 WITH LLVM-exception', 'allowed'],
    ['(MIT AND (ISC OR GPL-2.0)) OR BUSL-1.1', 'allowed'],
  ] as const)('%s → %s', (expression, verdict) => {
    expect(classifyLicense(expression, policy)).toBe(verdict);
  });

  it.each(['', 'MIT OR', '(MIT', 'MIT)', 'AND MIT', 'MIT WITH'])('无法解析：%j', (expression) => {
    expect(classifyLicense(expression, policy)).toBeNull();
  });
});

describe('evaluateLicenses', () => {
  it('允许清单内的包不产生任何输出', () => {
    const result = evaluateLicenses({ MIT: [pkg('a', 'MIT')], ISC: [pkg('b', 'ISC')] }, policy);
    expect(result).toEqual({ violations: [], notices: [] });
  });

  it('禁止与无法解析的许可证记为违规', () => {
    const result = evaluateLicenses(
      { 'GPL-3.0': [pkg('gpl-lib', 'GPL-3.0')], 'MIT OR': [pkg('broken', 'MIT OR')] },
      policy,
    );
    expect(result.violations.map((v) => [v.name, v.detail])).toEqual([
      ['broken', '许可证表达式无法解析'],
      ['gpl-lib', '不在允许清单中'],
    ]);
  });

  it('有条件许可证只给提示，并带出条件', () => {
    const result = evaluateLicenses({ 'MPL-2.0': [pkg('lightningcss', 'MPL-2.0')] }, policy);
    expect(result.violations).toEqual([]);
    expect(result.notices[0]?.detail).toContain('不修改源文件');
  });

  it('例外须同时匹配包名与许可证', () => {
    const result = evaluateLicenses(
      { 'AGPL-3.0': [pkg('k6', 'AGPL-3.0'), pkg('other-agpl', 'AGPL-3.0')] },
      policy,
    );
    expect(result.notices.map((n) => n.name)).toEqual(['k6']);
    expect(result.violations.map((v) => v.name)).toEqual(['other-agpl']);
  });

  it('包自身缺少 license 字段时用分组键', () => {
    const result = evaluateLicenses(
      { 'GPL-2.0': [{ name: 'x', versions: ['1'], license: '' }] },
      policy,
    );
    expect(result.violations[0]?.license).toBe('GPL-2.0');
  });
});
