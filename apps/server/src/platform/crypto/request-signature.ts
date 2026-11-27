/**
 * 请求签名（02 §10.3）。受保护路径。iOS 的 SigningMiddleware（01 §8）必须与此逐字一致；
 * 两侧共用 packages/contracts/vectors/request-signature.json（由独立的 Python 实现生成）。
 *
 *   string_to_sign = METHOD \n PATH \n CANONICAL_QUERY \n X-Ts \n X-Nonce \n hex(SHA256(rawBody))
 *   X-Sig = base64url(HMAC-SHA256(k_sess, string_to_sign))，无填充
 *
 * CANONICAL_QUERY（02 未定义，P2-SRV-06 Q1 默认）：按解码后的（键、值）以 Unicode 码点顺序排序；
 * 键与值按 RFC 3986 编码（只保留 A-Z a-z 0-9 - . _ ~）；`key=value` 以 `&` 连接；无参数时为空串。
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type QueryPairs = [string, string][];

/** 按 Unicode 码点比较（不能用 JS 默认的 UTF-16 码元比较：两者对 BMP 以外的字符结论不同） */
function compareCodePoints(a: string, b: string): number {
  const ca = Array.from(a, (c) => c.codePointAt(0) as number);
  const cb = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    if (ca[i] !== cb[i]) return (ca[i] as number) - (cb[i] as number);
  }
  return ca.length - cb.length;
}

/** RFC 3986：encodeURIComponent 不编码 ! ' ( ) *，这里补上 */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${(c.codePointAt(0) as number).toString(16).toUpperCase()}`,
  );
}

export function canonicalQuery(pairs: QueryPairs): string {
  return [...pairs]
    .sort(([ka, va], [kb, vb]) => compareCodePoints(ka, kb) || compareCodePoints(va, vb))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join('&');
}

/**
 * 从原始 URL 取出查询参数。不用 URLSearchParams：它把 `+` 解码成空格，而 iOS 的 URLQueryItem 不编码 `+`，
 * 两侧会对不同的字符串签名。这里只做百分号解码。无法解码的参数视为签名不合法。
 */
export function parseQueryPairs(url: string): QueryPairs {
  const q = url.indexOf('?');
  if (q === -1 || q === url.length - 1) return [];
  return url
    .slice(q + 1)
    .split('&')
    .filter((part) => part.length > 0)
    .map((part) => {
      const eq = part.indexOf('=');
      const [k, v] = eq === -1 ? [part, ''] : [part.slice(0, eq), part.slice(eq + 1)];
      return [decodeURIComponent(k), decodeURIComponent(v)] as [string, string];
    });
}

export interface SignatureInput {
  method: string;
  path: string;
  query: QueryPairs;
  ts: string;
  nonce: string;
  rawBody: Uint8Array;
}

export function stringToSign(input: SignatureInput): string {
  const bodyHash = createHash('sha256').update(input.rawBody).digest('hex');
  return [
    input.method.toUpperCase(),
    input.path,
    canonicalQuery(input.query),
    input.ts,
    input.nonce,
    bodyHash,
  ].join('\n');
}

export function computeSignature(key: Uint8Array, sts: string): string {
  return createHmac('sha256', key).update(sts, 'utf8').digest('base64url');
}

/** 常数时间比较；长度不同直接判否 */
export function signatureMatches(key: Uint8Array, sts: string, provided: string): boolean {
  const expected = Buffer.from(computeSignature(key, sts), 'utf8');
  const actual = Buffer.from(provided, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
