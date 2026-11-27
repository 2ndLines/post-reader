import { describe, expect, it } from 'vitest';
import { checkToolVersions, parseMiseTools } from './tool-versions.ts';

const miseToml = `# 注释\n[tools]\nnode = "26.13.1"\npnpm = "12.23.0" # 行尾注释\ngitleaks = "8.30.1"\n\n[env]\nnode = "not-a-tool"\n`;
const good = {
  miseToml,
  nvmrc: '26.13.1\n',
  packageJson: { packageManager: 'pnpm@12.23.0', engines: { node: '>=26 <27' } },
  workflows: [{ file: 'ci.yml', content: 'env:\n  GITLEAKS_VERSION: "8.30.1"\n' }],
};

describe('parseMiseTools', () => {
  it('只读取 [tools] 段', () => {
    expect(parseMiseTools(miseToml)).toEqual({
      node: '26.13.1',
      pnpm: '12.23.0',
      gitleaks: '8.30.1',
    });
  });
});

describe('checkToolVersions', () => {
  it('全部一致时无错误', () => {
    expect(checkToolVersions(good)).toEqual([]);
  });

  it('逐项报告不一致', () => {
    const errors = checkToolVersions({
      ...good,
      nvmrc: '25.9.0',
      packageJson: { packageManager: 'pnpm@12.18.0', engines: { node: '>=25' } },
      workflows: [{ file: 'ci.yml', content: 'GITLEAKS_VERSION: 8.29.0' }],
    });
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/\.nvmrc（25\.9\.0）/);
    expect(errors.join('\n')).toMatch(/engines\.node 应为 ">=26 <27"/);
    expect(errors.join('\n')).toMatch(/packageManager 应为 "pnpm@12\.23\.0"/);
    expect(errors.join('\n')).toMatch(/GITLEAKS_VERSION（8\.29\.0）/);
  });

  it('.mise.toml 缺项时报告缺失，而不是静默通过', () => {
    expect(checkToolVersions({ ...good, miseToml: '[tools]\n' })).toEqual([
      '.mise.toml 缺少 node 版本',
      '.mise.toml 缺少 pnpm 版本',
      '.mise.toml 缺少 gitleaks 版本',
    ]);
  });
});
