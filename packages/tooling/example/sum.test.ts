import { describe, expect, it } from 'vitest';
import { sum } from './sum.ts';

describe('sum', () => {
  it('空数组为 0', () => {
    expect(sum([])).toBe(0);
  });

  it('累加全部元素', () => {
    expect(sum([1, 2, 3.5])).toBe(6.5);
  });
});
