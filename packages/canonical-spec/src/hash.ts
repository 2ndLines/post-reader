/**
 * 摘要（SPEC.md §3）：H = hex(SHA256(lp(unitId) ‖ lp(authorId) ‖ lp(cleanText)))，
 * lp(x) = uint32_be(len(utf8(x))) ‖ utf8(x)。只用 Web Crypto，Node 26 与 Workers 共用。
 */

const encoder = new TextEncoder();

/** 4 字节大端长度前缀 + UTF-8 字节 */
export function lp(value: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(value);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, false);
  out.set(bytes, 4);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Web Crypto 只接受以 ArrayBuffer（而非 SharedArrayBuffer）为底的视图 */
export async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 单元摘要。cleanText 必须是 clean() 的输出；unitId、authorId 按原值参与 */
export function unitHash(unitId: string, authorId: string, cleanText: string): Promise<string> {
  return sha256Hex(concat([lp(unitId), lp(authorId), lp(cleanText)]));
}
