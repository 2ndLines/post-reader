import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** ADR 0011：只使用 Redis 7.0 社区版命令；脚本中出现的命令必须在本白名单中，新增命令需先确认 7.0 支持 */
const ALLOWED = new Set([
  'TIME',
  'HMGET',
  'HSET',
  'PEXPIRE',
  'GET',
  'SET',
  'INCR',
  'EXPIRE',
  'DEL',
  'EXISTS',
]);
const dir = resolve(import.meta.dirname, 'scripts');

describe('Lua 脚本只用 Redis 7.0 社区版命令（ADR 0011）', () => {
  it.each(readdirSync(dir).filter((f) => f.endsWith('.lua')))('%s', (file) => {
    const commands = [
      ...readFileSync(resolve(dir, file), 'utf8').matchAll(/redis\.(?:p?call)\('([A-Za-z]+)'/g),
    ].map((m) => (m[1] as string).toUpperCase());
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.filter((c) => !ALLOWED.has(c))).toEqual([]);
  });
});
