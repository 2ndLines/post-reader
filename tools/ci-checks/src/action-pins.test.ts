import { describe, expect, it } from 'vitest';
import { findUnpinnedActions } from './action-pins.ts';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

describe('findUnpinnedActions', () => {
  it('完整 SHA 加版本注释通过', () => {
    const yml = `steps:\n  - uses: actions/checkout@${SHA} # v7.0.1\n  - name: x\n    uses: "pnpm/action-setup@${SHA}"  # v6\n`;
    expect(findUnpinnedActions('ci.yml', yml)).toEqual([]);
  });

  it('本地 Action 与按 digest 固定的镜像通过', () => {
    const digest = 'a'.repeat(64);
    const yml = `- uses: ./.github/actions/setup\n- uses: docker://alpine@sha256:${digest}\n`;
    expect(findUnpinnedActions('ci.yml', yml)).toEqual([]);
  });

  it.each([
    ['actions/checkout@v7', '未按 40 位 commit SHA 固定'],
    ['actions/checkout@main', '未按 40 位 commit SHA 固定'],
    [`actions/checkout@${SHA.slice(0, 7)}`, '未按 40 位 commit SHA 固定'],
    ['actions/checkout', '未按 40 位 commit SHA 固定'],
    [`actions/checkout@${SHA}`, '缺少版本号注释（例如 `# v4.2.1`）'],
    ['docker://alpine:3.20', 'docker 镜像未按 digest 固定'],
  ])('拒绝 %s', (uses, reason) => {
    const [violation] = findUnpinnedActions(
      'ci.yml',
      `jobs:\n  a:\n    steps:\n      - uses: ${uses}\n`,
    );
    expect(violation).toEqual({ file: 'ci.yml', line: 4, uses, reason });
  });

  it('子路径 Action 也必须固定', () => {
    const yml = `- uses: github/codeql-action/init@${SHA} # v3.2.0\n- uses: github/codeql-action/analyze@v3\n`;
    expect(findUnpinnedActions('ci.yml', yml).map((v) => v.line)).toEqual([2]);
  });
});
