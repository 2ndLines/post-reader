import { describe, expect, it } from 'vitest';
import { findChangedPublishedMigrations } from './migrations.ts';

const published = [{ path: 'drizzle/0000_a.sql', content: 'create table a();' }];

describe('已发布迁移不可变（02 §17 第 5 条）', () => {
  it('原样保留并新增迁移：通过', () => {
    const current = new Map([
      ['drizzle/0000_a.sql', 'create table a();'],
      ['drizzle/0001_b.sql', 'create table b();'],
    ]);
    expect(findChangedPublishedMigrations(published, current)).toEqual([]);
  });

  it('修改已发布的迁移：违规', () => {
    const current = new Map([['drizzle/0000_a.sql', 'create table a(x int);']]);
    expect(findChangedPublishedMigrations(published, current)).toEqual([
      { path: 'drizzle/0000_a.sql', reason: '已发布的迁移被修改' },
    ]);
  });

  it('删除已发布的迁移：违规', () => {
    expect(findChangedPublishedMigrations(published, new Map())).toEqual([
      { path: 'drizzle/0000_a.sql', reason: '已发布的迁移被删除' },
    ]);
  });
});
