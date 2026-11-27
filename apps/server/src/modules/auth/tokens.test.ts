import { generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_S,
  hashRefreshToken,
  issueAccessToken,
  newRefreshToken,
  newSessionKey,
  TokenInvalidError,
  verifyAccessToken,
} from './tokens.ts';

const claims = { sub: 'u-1', sid: 's-1', region: 'intl' as const, tier: 'free' as const };

async function keys(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  return { signing: { kid, privateKey }, verification: { kid, publicKey } };
}

describe('访问令牌（ES256，02 §10.1）', () => {
  it('签发后可验证，声明齐全，有效期 15 分钟', async () => {
    const k = await keys('k1');
    const now = new Date('2026-11-26T00:00:00Z');
    const token = await issueAccessToken(k.signing, claims, now);
    const verified = await verifyAccessToken(token, [k.verification], now);
    expect(verified).toMatchObject(claims);
    expect(verified.exp - Math.floor(now.getTime() / 1000)).toBe(ACCESS_TOKEN_TTL_S);
  });

  it('过期后拒绝，并标记为 expired', async () => {
    const k = await keys('k1');
    const issued = new Date('2026-11-26T00:00:00Z');
    const token = await issueAccessToken(k.signing, claims, issued);
    const later = new Date(issued.getTime() + (ACCESS_TOKEN_TTL_S + 1) * 1000);
    await expect(verifyAccessToken(token, [k.verification], later)).rejects.toMatchObject({
      expired: true,
    });
  });

  it('密钥轮换：同时登记新旧两把公钥时，两种令牌都能验证；未知 kid 拒绝', async () => {
    const old = await keys('k-old');
    const fresh = await keys('k-new');
    const registry = [old.verification, fresh.verification];
    await expect(
      verifyAccessToken(await issueAccessToken(old.signing, claims), registry),
    ).resolves.toMatchObject(claims);
    await expect(
      verifyAccessToken(await issueAccessToken(fresh.signing, claims), registry),
    ).resolves.toMatchObject(claims);
    const stranger = await keys('k-unknown');
    await expect(
      verifyAccessToken(await issueAccessToken(stranger.signing, claims), registry),
    ).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it('kid 相同但签名用的是另一把私钥：拒绝', async () => {
    const real = await keys('k1');
    const forged = await keys('k1');
    const token = await issueAccessToken(forged.signing, claims);
    await expect(verifyAccessToken(token, [real.verification])).rejects.toMatchObject({
      expired: false,
    });
  });

  it('只接受 ES256：用 HS256 等其他算法签的令牌一律拒绝', async () => {
    const k = await keys('k1');
    const hs = await new SignJWT({ sid: 's-1', region: 'intl', tier: 'free' })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setSubject('u-1')
      .setIssuer('post-reader')
      .setAudience('post-reader-api')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new Uint8Array(32));
    await expect(verifyAccessToken(hs, [k.verification])).rejects.toBeInstanceOf(TokenInvalidError);
  });
});

describe('refresh token 与会话密钥', () => {
  it('refresh token 为 32 字节随机数的 base64url；只存 SHA-256', () => {
    const token = newRefreshToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(newRefreshToken()).not.toBe(token);
  });

  it('会话密钥 k_sess 为 32 字节', () => {
    expect(newSessionKey()).toHaveLength(32);
  });
});
