import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userKeys, users } from '../../modules/auth/schema.ts';
import { decryptField, encryptField } from '../crypto/field.ts';
import { createTestDatabase } from '../db/test-database.ts';
import { newId } from '../id.ts';
import { DekCache } from './dek-cache.ts';
import { LocalFileKms } from './local.ts';
import { createUserKey, getUserDek, UserKeyNotFoundError } from './user-keys.ts';

let t: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const kms = new LocalFileKms({
  keyId: 'local-test',
  masterKey: new Uint8Array(32).fill(3),
  nodeEnv: 'test',
});

describe('用户 DEK 与密码擦除（02 §10.4；《完整技术架构》§11.3）', () => {
  it('建密钥 → 加密 → 冷缓存解包后可解密；删除 user_keys 后无法再取得密钥', async () => {
    const userId = newId();
    await t.db.insert(users).values({ id: userId, homeRegion: 'intl', billingTz: 'UTC' });
    const dek = await createUserKey(t.db, kms, userId);
    const ctx = { column: 'users.email_enc', ownerId: userId };
    const sealed = encryptField(dek, 'user@example.com', ctx);

    const [row] = await t.db.select().from(userKeys).where(eq(userKeys.userId, userId));
    expect(row?.kmsKeyId).toBe('local-test');
    expect(Buffer.from(row?.wrappedDek ?? []).includes(Buffer.from(dek))).toBe(false);

    // 冷缓存：从数据库读取并解包
    const cache = new DekCache();
    expect(decryptField(await getUserDek(t.db, kms, cache, userId), sealed, ctx)).toBe(
      'user@example.com',
    );

    // 注销第一步：删除 user_keys 并清缓存 → 密文不可再解密
    await t.db.delete(userKeys).where(eq(userKeys.userId, userId));
    cache.invalidate(userId);
    await expect(getUserDek(t.db, kms, cache, userId)).rejects.toBeInstanceOf(UserKeyNotFoundError);
  });

  it('缓存命中时不访问 KMS', async () => {
    const userId = newId();
    await t.db.insert(users).values({ id: userId, homeRegion: 'intl', billingTz: 'UTC' });
    await createUserKey(t.db, kms, userId);
    let unwraps = 0;
    const counting = {
      keyId: kms.keyId,
      wrapDek: kms.wrapDek.bind(kms),
      unwrapDek: async (w: Uint8Array) => {
        unwraps += 1;
        return kms.unwrapDek(w);
      },
    };
    const cache = new DekCache();
    await getUserDek(t.db, counting, cache, userId);
    await getUserDek(t.db, counting, cache, userId);
    expect(unwraps).toBe(1);
  });
});
