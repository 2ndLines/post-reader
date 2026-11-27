/**
 * 身份与会话相关的表（《完整技术架构》§11.1；02 §10、§18.3、§23.1、§23.3）。
 * 受保护路径（playbook §9.4）。只写本模块拥有的表（02 §17 第 2 条）。
 * 个人信息列以 `_enc` 结尾，用 platform/crypto 的 AES-256-GCM 加密（P2-SRV-04）；`_hash` 列为 HMAC，不可逆。
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => 'bytea' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    homeRegion: text('home_region', { enum: ['cn', 'intl'] }).notNull(),
    /** 邮箱的 HMAC，用于查重与登录；Sign in with Apple 可能没有邮箱 */
    emailHash: text('email_hash'),
    emailEnc: bytea('email_enc'),
    status: text('status', { enum: ['active', 'deleting'] })
      .notNull()
      .default('active'),
    /** IANA 时区；国内区固定 Asia/Shanghai（02 §23.1） */
    billingTz: text('billing_tz').notNull(),
    /** 上次修改计费时区的时间：30 天内不可再改 */
    billingTzChangedAt: timestamp('billing_tz_changed_at', { withTimezone: true }),
    /** 首次注册时确认年满 18 岁（02 §23.3） */
    ageConfirmedAt: timestamp('age_confirmed_at', { withTimezone: true }),
    /** 支持码（02 §18.3），不可反推用户 ID */
    supportCode: text('support_code'),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_hash').on(t.emailHash),
    uniqueIndex('users_support_code').on(t.supportCode),
  ],
);

export const authIdentities = pgTable(
  'auth_identities',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['apple', 'email'] }).notNull(),
    subject: text('subject').notNull(),
    providerRefreshEnc: bytea('provider_refresh_enc'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.subject] }),
    index('auth_identities_user').on(t.userId),
  ],
);

/** 每用户一把 DEK，由区域 KMS 主密钥包裹；注销时最先删除（密码擦除，《完整技术架构》§11.3） */
export const userKeys = pgTable('user_keys', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  wrappedDek: bytea('wrapped_dek').notNull(),
  kmsKeyId: text('kms_key_id').notNull(),
  createdAt: createdAt(),
});

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 客户端登录时上报的 deviceId（P2-SRV-02 Q1：设计未给出两者的映射，按用户唯一） */
    clientDeviceId: text('client_device_id').notNull(),
    attestKeyId: text('attest_key_id'),
    publicKey: bytea('public_key'),
    /** App Attest assertion 计数器，必须单调递增（02 §10.2） */
    counter: bigint('counter', { mode: 'bigint' }).notNull().default(sql`0`),
    riskFlag: boolean('risk_flag').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('devices_attest_key_id').on(t.attestKeyId),
    uniqueIndex('devices_user_client_device').on(t.userId, t.clientDeviceId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    /** refresh token 的 SHA-256；明文只在客户端 Keychain（02 §10.1） */
    refreshHash: text('refresh_hash').notNull(),
    /** 刷新轮换链；旧 refresh token 被重用时吊销整个 family */
    familyId: uuid('family_id').notNull(),
    /** 请求签名密钥 k_sess，用用户 DEK 加密 */
    sessionKeyEnc: bytea('session_key_enc').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sessions_refresh_hash').on(t.refreshHash),
    index('sessions_user').on(t.userId),
    index('sessions_family').on(t.familyId),
  ],
);
