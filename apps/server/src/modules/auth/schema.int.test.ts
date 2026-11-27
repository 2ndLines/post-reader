import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../platform/db/migrate.ts';
import { createTestDatabase } from '../../platform/db/test-database.ts';
import { newId } from '../../platform/id.ts';
import { authIdentities, devices, sessions, userKeys, users } from './schema.ts';

let t: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const bytes = (s: string) => new TextEncoder().encode(s);

async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const id = newId();
  await t.db
    .insert(users)
    .values({ id, homeRegion: 'intl', billingTz: 'America/Los_Angeles', ...overrides });
  return id;
}

async function pgError(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    // drizzle 把驱动错误包在 cause 中；SQLSTATE 23505 = unique_violation，23503 = foreign_key_violation
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
}

describe('身份与会话表（迁移 0000_identity）', () => {
  it('迁移建出 5 张表；重复执行迁移不报错（幂等）', async () => {
    const rows = await t.sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' order by table_name`;
    expect(rows.map((r) => r.table_name)).toEqual([
      'auth_identities',
      'devices',
      'sessions',
      'user_keys',
      'users',
    ]);
    await expect(runMigrations(t.url)).resolves.toBeUndefined();
  });

  it('PostgreSQL 版本为 18', async () => {
    const [row] = await t.sql<{ v: string }[]>`select current_setting('server_version_num') as v`;
    expect(Number(row?.v)).toBeGreaterThanOrEqual(180000);
  });

  it('users.email_hash 唯一；没有邮箱（NULL）的用户可以有多个', async () => {
    await seedUser({ emailHash: 'h1' });
    expect(await pgError(seedUser({ emailHash: 'h1' }))).toBe('23505');
    await seedUser();
    await seedUser();
  });

  it('auth_identities 的 (provider, subject) 唯一', async () => {
    const a = await seedUser();
    const b = await seedUser();
    await t.db
      .insert(authIdentities)
      .values({ userId: a, provider: 'apple', subject: 'apple-sub-1' });
    expect(
      await pgError(
        t.db
          .insert(authIdentities)
          .values({ userId: b, provider: 'apple', subject: 'apple-sub-1' }),
      ),
    ).toBe('23505');
    await t.db
      .insert(authIdentities)
      .values({ userId: b, provider: 'email', subject: 'apple-sub-1' });
  });

  it('sessions.refresh_hash 唯一；devices.attest_key_id 唯一；同一用户的 client_device_id 唯一', async () => {
    const u = await seedUser();
    const session = {
      userId: u,
      familyId: newId(),
      sessionKeyEnc: bytes('k'),
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    await t.db.insert(sessions).values({ id: newId(), refreshHash: 'r1', ...session });
    expect(
      await pgError(t.db.insert(sessions).values({ id: newId(), refreshHash: 'r1', ...session })),
    ).toBe('23505');

    await t.db
      .insert(devices)
      .values({ id: newId(), userId: u, clientDeviceId: 'd1', attestKeyId: 'k1' });
    expect(
      await pgError(
        t.db
          .insert(devices)
          .values({ id: newId(), userId: u, clientDeviceId: 'd2', attestKeyId: 'k1' }),
      ),
    ).toBe('23505');
    expect(
      await pgError(t.db.insert(devices).values({ id: newId(), userId: u, clientDeviceId: 'd1' })),
    ).toBe('23505');
  });

  it('外键：不能为不存在的用户写子表', async () => {
    expect(
      await pgError(
        t.db.insert(userKeys).values({ userId: newId(), wrappedDek: bytes('x'), kmsKeyId: 'k' }),
      ),
    ).toBe('23503');
  });

  it('删除用户时级联删除全部子表（注销流程的基础，《完整技术架构》§11.3）', async () => {
    const u = await seedUser({ emailHash: 'to-delete' });
    const deviceId = newId();
    await t.db
      .insert(userKeys)
      .values({ userId: u, wrappedDek: bytes('dek'), kmsKeyId: 'local-key' });
    await t.db
      .insert(authIdentities)
      .values({ userId: u, provider: 'email', subject: 'to-delete' });
    await t.db.insert(devices).values({ id: deviceId, userId: u, clientDeviceId: 'phone' });
    await t.db.insert(sessions).values({
      id: newId(),
      userId: u,
      deviceId,
      refreshHash: 'r-del',
      familyId: newId(),
      sessionKeyEnc: bytes('k'),
      expiresAt: new Date(Date.now() + 1000),
    });

    await t.db.delete(users).where(eq(users.id, u));

    for (const [table, column] of [
      [userKeys, userKeys.userId],
      [authIdentities, authIdentities.userId],
      [devices, devices.userId],
      [sessions, sessions.userId],
    ] as const) {
      expect(await t.db.select().from(table).where(eq(column, u))).toEqual([]);
    }
  });

  it('bytea 列按字节原样读写；counter 为 bigint', async () => {
    const u = await seedUser();
    const raw = new Uint8Array([0, 1, 254, 255]);
    await t.db.insert(userKeys).values({ userId: u, wrappedDek: raw, kmsKeyId: 'k' });
    const [row] = await t.db.select().from(userKeys).where(eq(userKeys.userId, u));
    expect(Array.from(row?.wrappedDek ?? [])).toEqual([0, 1, 254, 255]);
    const id = newId();
    await t.db
      .insert(devices)
      .values({ id, userId: u, clientDeviceId: 'c', counter: 9_007_199_254_740_993n });
    const [device] = await t.db.select().from(devices).where(eq(devices.id, id));
    expect(device?.counter).toBe(9_007_199_254_740_993n);
  });
});
