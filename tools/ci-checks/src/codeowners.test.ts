import { describe, expect, it } from 'vitest';
import {
  checkCoverage,
  expandBraces,
  extractProtectedPaths,
  parseCodeowners,
} from './codeowners.ts';

describe('expandBraces', () => {
  it('展开单个与多个花括号', () => {
    expect(expandBraces('a/{x,y}/b')).toEqual(['a/x/b', 'a/y/b']);
    expect(expandBraces('{a,b}/{1,2}')).toEqual(['a/1', 'a/2', 'b/1', 'b/2']);
    expect(expandBraces('plain/**')).toEqual(['plain/**']);
  });
});

describe('extractProtectedPaths', () => {
  const playbook = [
    '### 9.3 其他',
    '```text',
    'not/this/**',
    '```',
    '### 9.4 受保护路径（必须负责人审阅）',
    '',
    '```text',
    'apps/server/src/modules/{auth,quota}/**',
    'config/tiers.yaml config/quotas.yaml',
    'AGENTS.md',
    '```',
    '```text',
    'later/block/**',
    '```',
  ].join('\n');

  it('只取 §9.4 之后的第一个代码块，按空白拆分并展开', () => {
    expect(extractProtectedPaths(playbook)).toEqual([
      'apps/server/src/modules/auth/**',
      'apps/server/src/modules/quota/**',
      'config/tiers.yaml',
      'config/quotas.yaml',
      'AGENTS.md',
    ]);
  });

  it('缺少 §9.4 或代码块时报错，而不是返回空列表', () => {
    expect(() => extractProtectedPaths('### 9.3\n```\nx\n```')).toThrow('9.4');
    expect(() => extractProtectedPaths('### 9.4 受保护路径\n无代码块')).toThrow('代码块');
  });
});

describe('checkCoverage', () => {
  const rules = parseCodeowners(
    ['# 注释', '/AGENTS.md @owner', '/infra/** @owner # 行尾注释', '/config/tiers.yaml', ''].join(
      '\n',
    ),
  );

  it('解析规则与负责人，忽略注释', () => {
    expect(rules).toEqual([
      { pattern: '/AGENTS.md', owners: ['@owner'] },
      { pattern: '/infra/**', owners: ['@owner'] },
      { pattern: '/config/tiers.yaml', owners: [] },
    ]);
  });

  it('全部覆盖时无问题', () => {
    expect(checkCoverage(['AGENTS.md', 'infra/**'], rules)).toEqual([]);
  });

  it('报告缺失的路径与没有负责人的规则', () => {
    expect(checkCoverage(['AGENTS.md', 'evals/gates.yaml', 'config/tiers.yaml'], rules)).toEqual([
      { path: 'evals/gates.yaml', reason: 'CODEOWNERS 中没有 /evals/gates.yaml' },
      { path: 'config/tiers.yaml', reason: '/config/tiers.yaml 没有指定负责人' },
    ]);
  });

  it('未锚定的同名规则不算覆盖（它会匹配任意层级，语义不同）', () => {
    expect(checkCoverage(['AGENTS.md'], parseCodeowners('AGENTS.md @owner'))).toHaveLength(1);
  });

  it('同一路径出现多次时以最后一条为准', () => {
    const later = parseCodeowners('/infra/** @owner\n/infra/**');
    expect(checkCoverage(['infra/**'], later)).toHaveLength(1);
  });
});
