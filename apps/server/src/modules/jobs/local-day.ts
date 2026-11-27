/**
 * 计费时区下的「当日」（02 §11.3：R_daily 的键按 users.billing_tz 的日期区分，resetAt = 次日 0 点）。
 * 夏令时切换日的长度不是 24 小时，所以次日 0 点按该时区实际偏移计算，不用 now + 剩余秒数近似。
 */
function parts(instant: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** 该时区在某一时刻相对 UTC 的偏移（毫秒，东为正） */
function offsetAt(instant: number, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function localDay(now: Date, timeZone: string) {
  const p = parts(now.getTime(), timeZone);
  const date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day + 1);
  let next = midnightAsUtc - offsetAt(midnightAsUtc, timeZone);
  next = midnightAsUtc - offsetAt(next, timeZone);
  return {
    /** YYYY-MM-DD（计费时区） */
    date,
    nextMidnight: new Date(next),
    secondsUntilMidnight: Math.max(1, Math.ceil((next - now.getTime()) / 1000)),
  };
}
