import { describe, expect, it } from 'vitest';
import { localDay } from './local-day.ts';

describe('localDay', () => {
  it('UTC+8：UTC 当天 16:00 之后已是当地次日', () => {
    const d = localDay(new Date('2026-11-26T17:30:00Z'), 'Asia/Shanghai');
    expect(d.date).toBe('2026-11-27');
    expect(d.nextMidnight.toISOString()).toBe('2026-11-27T16:00:00.000Z');
    expect(d.secondsUntilMidnight).toBe(22.5 * 3600);
  });

  it('UTC：剩余秒数与次日 0 点一致', () => {
    const d = localDay(new Date('2026-11-26T23:59:30Z'), 'UTC');
    expect(d).toEqual({
      date: '2026-11-26',
      nextMidnight: new Date('2026-11-27T00:00:00Z'),
      secondsUntilMidnight: 30,
    });
  });

  it('夏令时开始的当天（美东 2027-03-14 只有 23 小时）', () => {
    const d = localDay(new Date('2027-03-14T05:00:00Z'), 'America/New_York');
    expect(d.date).toBe('2027-03-14');
    // 次日 0 点为 EDT（UTC-4）
    expect(d.nextMidnight.toISOString()).toBe('2027-03-15T04:00:00.000Z');
    expect(d.secondsUntilMidnight).toBe(23 * 3600);
  });

  it('夏令时结束的当天（美东 2027-11-07 有 25 小时）', () => {
    const d = localDay(new Date('2027-11-07T04:00:00Z'), 'America/New_York');
    expect(d.date).toBe('2027-11-07');
    expect(d.nextMidnight.toISOString()).toBe('2027-11-08T05:00:00.000Z');
    expect(d.secondsUntilMidnight).toBe(25 * 3600);
  });
});
