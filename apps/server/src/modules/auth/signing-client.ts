/**
 * 测试用的客户端签名（与 iOS SigningMiddleware 相同的算法；本实现已对独立的 Python 黄金向量验证过，P2-SRV-06）。
 * 只给集成测试使用。
 */
import { randomBytes } from 'node:crypto';
import {
  computeSignature,
  parseQueryPairs,
  stringToSign,
} from '../../platform/crypto/request-signature.ts';

export type Session = { accessToken: string; sessionKey: string };

export function signedHeaders(
  session: Session,
  method: string,
  url: string,
  body: string,
  overrides: Partial<{ ts: string; nonce: string; key: Uint8Array }> = {},
) {
  const ts = overrides.ts ?? String(Date.now());
  const nonce = overrides.nonce ?? randomBytes(8).toString('hex');
  const q = url.indexOf('?');
  const sts = stringToSign({
    method,
    path: q === -1 ? url : url.slice(0, q),
    query: parseQueryPairs(url),
    ts,
    nonce,
    rawBody: new TextEncoder().encode(body),
  });
  return {
    authorization: `Bearer ${session.accessToken}`,
    'x-ts': ts,
    'x-nonce': nonce,
    'x-sig': computeSignature(overrides.key ?? Buffer.from(session.sessionKey, 'base64'), sts),
  };
}
