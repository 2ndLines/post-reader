import { describe, expect, it } from 'vitest';
import { JOB_STATES } from './schema.ts';
import { canTransition, isTerminal, type JobState } from './state.ts';

describe('任务状态机（02 §5.4）', () => {
  it('主链按顺序推进，不能跳步或倒退', () => {
    const chain: JobState[] = [
      'created',
      'admitted',
      'planning',
      'scripting',
      'synthesizing',
      'completed',
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      expect(canTransition(chain[i] as JobState, chain[i + 1] as JobState)).toBe(true);
    }
    expect(canTransition('admitted', 'synthesizing')).toBe(false);
    expect(canTransition('scripting', 'planning')).toBe(false);
  });

  it('rejected 只能从 created 进入；quota_exhausted 只能从 synthesizing 进入', () => {
    expect(JOB_STATES.filter((s) => canTransition(s, 'rejected'))).toEqual(['created']);
    expect(JOB_STATES.filter((s) => canTransition(s, 'quota_exhausted'))).toEqual(['synthesizing']);
  });

  it('任何非终态都可以 failed 或 cancelled；终态不能再转移', () => {
    for (const from of JOB_STATES) {
      for (const to of JOB_STATES) {
        if (isTerminal(from)) expect(canTransition(from, to)).toBe(false);
        else if (to === 'failed' || to === 'cancelled') expect(canTransition(from, to)).toBe(true);
      }
    }
    expect(JOB_STATES.filter(isTerminal)).toEqual([
      'completed',
      'rejected',
      'failed',
      'cancelled',
      'quota_exhausted',
    ]);
  });
});
