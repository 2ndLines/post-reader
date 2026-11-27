import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalQuery,
  computeSignature,
  parseQueryPairs,
  signatureMatches,
  stringToSign,
} from './request-signature.ts';

/** 与 iOS 共用的黄金向量：由 packages/contracts/scripts/request_signature_vectors.py（Python 标准库）独立生成 */
const file = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../../../packages/contracts/vectors/request-signature.json',
    ),
    'utf8',
  ),
) as {
  key_hex: string;
  vectors: {
    name: string;
    method: string;
    path: string;
    query: [string, string][];
    ts: string;
    nonce: string;
    body: string;
    expectedCanonicalQuery: string;
    expectedStringToSign: string;
    expectedSig: string;
  }[];
};
const key = Buffer.from(file.key_hex, 'hex');

describe('请求签名黄金向量（02 §10.3）', () => {
  it.each(file.vectors.map((v) => [v.name, v] as const))('%s', (_n, v) => {
    expect(canonicalQuery(v.query)).toBe(v.expectedCanonicalQuery);
    const sts = stringToSign({ ...v, rawBody: new TextEncoder().encode(v.body) });
    expect(sts).toBe(v.expectedStringToSign);
    expect(computeSignature(key, sts)).toBe(v.expectedSig);
    expect(signatureMatches(key, sts, v.expectedSig)).toBe(true);
  });
});

describe('规范化细节', () => {
  it('按码点而不是 UTF-16 码元排序（BMP 末尾的字符排在 emoji 之前）', () => {
    // U+FFFD 的 UTF-16 码元 0xFFFD 大于 emoji 的高代理 0xD83D，但码点 0xFFFD 小于 0x1F600
    expect(
      canonicalQuery([
        ['k', '\u{1F600}'],
        ['k', '�'],
      ]),
    ).toBe('k=%EF%BF%BD&k=%F0%9F%98%80');
  });

  it("RFC 3986：! ' ( ) * 也要编码", () => {
    expect(canonicalQuery([['a', "!'()*"]])).toBe('a=%21%27%28%29%2A');
  });

  it('查询串解析：+ 保持为 +，不当作空格；没有值的参数为空串', () => {
    expect(parseQueryPairs('/v1/x?a=1+2&b=%20&flag')).toEqual([
      ['a', '1+2'],
      ['b', ' '],
      ['flag', ''],
    ]);
    expect(parseQueryPairs('/v1/x')).toEqual([]);
    expect(parseQueryPairs('/v1/x?')).toEqual([]);
  });

  it('百分号编码不合法时抛错（由调用方按签名不合法处理）', () => {
    expect(() => parseQueryPairs('/v1/x?a=%E0%A4%A')).toThrow();
  });

  it('签名长度不同或内容不同时判否', () => {
    const sts = 'GET\n/v1/x\n\n1\nn\ne3';
    const sig = computeSignature(key, sts);
    expect(signatureMatches(key, sts, sig.slice(1))).toBe(false);
    expect(signatureMatches(key, sts, `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`)).toBe(
      false,
    );
    expect(signatureMatches(Buffer.alloc(32), sts, sig)).toBe(false);
  });
});
