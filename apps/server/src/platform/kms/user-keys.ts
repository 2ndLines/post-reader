/**
 * 用户 DEK 的取得：先查缓存，未命中时从 user_keys 读取包裹后的 DEK 并用 KMS 解包（02 §10.4）。
 * user_keys 行被删除后（注销第一步，《完整技术架构》§11.3）该用户的全部密文不可再解密（密码擦除）。
 */
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { userKeys } from '../../modules/auth/schema.ts';
import { generateDek } from '../crypto/field.ts';
import type { DekCache } from './dek-cache.ts';
import type { Kms } from './types.ts';

export class UserKeyNotFoundError extends Error {
  constructor() {
    super('用户数据密钥不存在（可能已注销）');
    this.name = 'UserKeyNotFoundError';
  }
}

export async function createUserKey(
  db: PostgresJsDatabase,
  kms: Kms,
  userId: string,
): Promise<Uint8Array> {
  const dek = generateDek();
  await db
    .insert(userKeys)
    .values({ userId, wrappedDek: await kms.wrapDek(dek), kmsKeyId: kms.keyId });
  return dek;
}

export async function getUserDek(
  db: PostgresJsDatabase,
  kms: Kms,
  cache: DekCache,
  userId: string,
): Promise<Uint8Array> {
  const cached = cache.get(userId);
  if (cached) return cached;
  const [row] = await db.select().from(userKeys).where(eq(userKeys.userId, userId));
  if (!row) throw new UserKeyNotFoundError();
  const dek = await kms.unwrapDek(row.wrappedDek);
  cache.set(userId, dek);
  return dek;
}
