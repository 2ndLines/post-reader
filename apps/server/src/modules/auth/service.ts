/**
 * 认证服务（02 §6.1、§10.1、§23.3；《完整技术架构》§11）。受保护路径。
 */
import type { Region, Tier } from '@post-reader/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Redis } from 'ioredis';
import { encryptField } from '../../platform/crypto/field.ts';
import { AppError } from '../../platform/http/errors.ts';
import { newId } from '../../platform/id.ts';
import type { DekCache } from '../../platform/kms/dek-cache.ts';
import type { Kms } from '../../platform/kms/types.ts';
import { createUserKey, getUserDek } from '../../platform/kms/user-keys.ts';
import { isSessionRevoked, revokeSession } from '../../platform/redis/limits.ts';
import { authIdentities, devices, sessions, users } from './schema.ts';
import {
  ACCESS_TOKEN_TTL_S,
  type AccessClaims,
  hashRefreshToken,
  issueAccessToken,
  newRefreshToken,
  newSessionKey,
  REFRESH_TOKEN_TTL_MS,
  type SigningKey,
  TokenInvalidError,
  type VerificationKey,
  verifyAccessToken,
} from './tokens.ts';

export interface AuthDeps {
  db: PostgresJsDatabase;
  redis: Redis;
  kms: Kms;
  dekCache: DekCache;
  signingKey: SigningKey;
  verificationKeys: VerificationKey[];
  region: Region;
  now?: () => Date;
}

export interface LoginIdentity {
  provider: 'apple' | 'email';
  subject: string;
  /** 只在首次注册时保存：email 登录为必填，Apple 登录时可能没有 */
  email?: string | undefined;
  emailHash?: string | undefined;
  /** 第三方登录换得的 refresh token（Apple），加密后存 auth_identities.provider_refresh_enc，注销时用于吊销 */
  providerRefreshToken?: string | undefined;
}

export interface LoginContext {
  deviceId: string;
  storefront?: string | undefined;
  ageConfirmed?: boolean | undefined;
}

/** 区域不匹配按 App Store 店面判定（ADR 0001；02 §21 regions.yaml 默认：cn 只含 CHN；缺少店面时不拦截） */
function assertRegion(region: Region, storefront: string | undefined): void {
  if (storefront === undefined) return;
  const belongsToCn = storefront === 'CHN';
  if ((region === 'cn') !== belongsToCn) throw new AppError('REGION_MISMATCH', 403);
}

/** 国内区固定 Asia/Shanghai；海外区在客户端上报设备时区（PATCH /me）前先用 UTC（P2-SRV-05 Q2） */
const defaultBillingTz = (region: Region) => (region === 'cn' ? 'Asia/Shanghai' : 'UTC');

export class AuthService {
  readonly #d: AuthDeps;

  constructor(deps: AuthDeps) {
    this.#d = deps;
  }

  #now() {
    return this.#d.now?.() ?? new Date();
  }

  async login(identity: LoginIdentity, context: LoginContext) {
    assertRegion(this.#d.region, context.storefront);
    const { db } = this.#d;
    const existing = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, identity.provider),
          eq(authIdentities.subject, identity.subject),
        ),
      );

    let userId = existing[0]?.userId;
    if (!userId) {
      // 首次注册必须确认年满 18 岁（02 §23.3）
      if (context.ageConfirmed !== true)
        throw new AppError('VALIDATION_FAILED', 400, 'age_confirmation_required');
      userId = await this.#register(identity);
    }
    const [user] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.status !== 'active') throw new AppError('AUTH_REVOKED', 401);

    if (identity.providerRefreshToken) {
      const dek = await getUserDek(db, this.#d.kms, this.#d.dekCache, userId);
      await db
        .update(authIdentities)
        .set({
          providerRefreshEnc: encryptField(dek, identity.providerRefreshToken, {
            column: 'auth_identities.provider_refresh_enc',
            ownerId: userId,
          }),
        })
        .where(
          and(
            eq(authIdentities.provider, identity.provider),
            eq(authIdentities.subject, identity.subject),
          ),
        );
    }
    const deviceRowId = await this.#upsertDevice(userId, context.deviceId);
    return this.#openSession(userId, deviceRowId, newId(), 'free');
  }

  async #register(identity: LoginIdentity): Promise<string> {
    const { db, kms, region } = this.#d;
    const userId = newId();
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        homeRegion: region,
        emailHash: identity.provider === 'email' ? (identity.emailHash ?? null) : null,
        billingTz: defaultBillingTz(region),
        ageConfirmedAt: this.#now(),
      });
      const dek = await createUserKey(tx, kms, userId);
      if (identity.email) {
        await tx
          .update(users)
          .set({
            emailEnc: encryptField(dek, identity.email, {
              column: 'users.email_enc',
              ownerId: userId,
            }),
          })
          .where(eq(users.id, userId));
      }
      await tx
        .insert(authIdentities)
        .values({ userId, provider: identity.provider, subject: identity.subject });
    });
    return userId;
  }

  async #upsertDevice(userId: string, clientDeviceId: string): Promise<string> {
    const [row] = await this.#d.db
      .insert(devices)
      .values({ id: newId(), userId, clientDeviceId })
      .onConflictDoUpdate({
        target: [devices.userId, devices.clientDeviceId],
        set: { clientDeviceId },
      })
      .returning({ id: devices.id });
    return row?.id as string;
  }

  async #openSession(userId: string, deviceId: string | null, familyId: string, tier: Tier) {
    const { db, kms, dekCache, signingKey, region } = this.#d;
    const sessionId = newId();
    const refreshToken = newRefreshToken();
    const sessionKey = newSessionKey();
    const dek = await getUserDek(db, kms, dekCache, userId);
    await db.insert(sessions).values({
      id: sessionId,
      userId,
      deviceId,
      refreshHash: hashRefreshToken(refreshToken),
      familyId,
      sessionKeyEnc: encryptField(dek, Buffer.from(sessionKey).toString('base64'), {
        column: 'sessions.session_key_enc',
        ownerId: userId,
      }),
      expiresAt: new Date(this.#now().getTime() + REFRESH_TOKEN_TTL_MS),
    });
    const accessToken = await issueAccessToken(
      signingKey,
      { sub: userId, sid: sessionId, region, tier },
      this.#now(),
    );
    return {
      accessToken,
      refreshToken,
      sessionKey: Buffer.from(sessionKey).toString('base64'),
      user: { userId, homeRegion: region, tier },
    };
  }

  /**
   * 刷新并轮换（02 §10.1）。旧 refresh token 被再次使用（含并发重复提交）时吊销整个 family（AUTH_REVOKED）。
   * 用条件 UPDATE 原子地「领取」旧会话：并发请求中只有一个成功，其余都按重用处理。
   */
  async refresh(refreshToken: string) {
    const { db } = this.#d;
    const now = this.#now();
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshHash, hashRefreshToken(refreshToken)));
    if (!session) throw new AppError('AUTH_EXPIRED', 401);
    if (session.revokedAt !== null) {
      await this.#revokeFamily(session.familyId);
      throw new AppError('AUTH_REVOKED', 401);
    }
    if (session.expiresAt.getTime() <= now.getTime()) throw new AppError('AUTH_EXPIRED', 401);

    const claimed = await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (claimed.length === 0) {
      await this.#revokeFamily(session.familyId);
      throw new AppError('AUTH_REVOKED', 401);
    }
    await revokeSession(this.#d.redis, session.id, ACCESS_TOKEN_TTL_S);
    const { user: _user, ...tokens } = await this.#openSession(
      session.userId,
      session.deviceId,
      session.familyId,
      'free',
    );
    return tokens;
  }

  async #revokeFamily(familyId: string): Promise<void> {
    await this.#d.db
      .update(sessions)
      .set({ revokedAt: this.#now() })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
    // 同一 family 下已签发、尚未过期的访问令牌也要立即失效（吊销名单 TTL = 访问令牌最长有效期）
    const members = await this.#d.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.familyId, familyId));
    for (const { id } of members) await revokeSession(this.#d.redis, id, ACCESS_TOKEN_TTL_S);
  }

  async logout(claims: AccessClaims & { exp: number }): Promise<void> {
    await this.#d.db
      .update(sessions)
      .set({ revokedAt: this.#now() })
      .where(eq(sessions.id, claims.sid));
    const remaining = claims.exp - Math.floor(this.#now().getTime() / 1000);
    await revokeSession(this.#d.redis, claims.sid, remaining);
  }

  /** 校验访问令牌并检查会话吊销名单（02 §4.1 第 4 步） */
  async authenticate(token: string) {
    let claims: AccessClaims & { exp: number };
    try {
      claims = await verifyAccessToken(token, this.#d.verificationKeys, this.#now());
    } catch (error) {
      // 过期与无效（签名错误、未知 kid、声明缺失）对客户端的处理相同：刷新或重新登录。ErrorCode 中没有单独的「令牌无效」
      if (!(error instanceof TokenInvalidError)) throw error;
      throw new AppError('AUTH_EXPIRED', 401);
    }
    if (claims.region !== this.#d.region) throw new AppError('REGION_MISMATCH', 403);
    if (await isSessionRevoked(this.#d.redis, claims.sid)) throw new AppError('AUTH_REVOKED', 401);
    return claims;
  }
}
