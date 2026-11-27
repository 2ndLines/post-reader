import { describe, expect, it } from 'vitest';
import { decryptField, encryptField, generateDek } from './field.ts';

const ctx = { column: 'users.email_enc', ownerId: 'u-1' };

describe('字段加密 AES-256-GCM（02 §10.4）', () => {
  it('加解密往返，含中文、emoji 与空串', () => {
    const dek = generateDek();
    for (const text of ['a@example.com', '你好 👨‍👩‍👧', '']) {
      expect(decryptField(dek, encryptField(dek, text, ctx), ctx)).toBe(text);
    }
  });

  it('存储格式为 v1 | iv(12) | 密文 | tag(16)；每次加密 iv 不同', () => {
    const dek = generateDek();
    const a = encryptField(dek, 'same', ctx);
    const b = encryptField(dek, 'same', ctx);
    expect(a[0]).toBe(0x01);
    expect(a.length).toBe(1 + 12 + 4 + 16);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it.each([
    ['版本字节', 0],
    ['iv', 5],
    ['密文', 14],
    ['tag', -1],
  ])('篡改%s后解密失败', (_name, index) => {
    const dek = generateDek();
    const sealed = Buffer.from(encryptField(dek, 'secret', ctx));
    const i = index < 0 ? sealed.length + index : index;
    sealed[i] = (sealed[i] as number) ^ 0x01;
    expect(() => decryptField(dek, sealed, ctx)).toThrow();
  });

  it('密文搬到别的列或别的用户名下无法解密（AAD 绑定）', () => {
    const dek = generateDek();
    const sealed = encryptField(dek, 'secret', ctx);
    expect(() =>
      decryptField(dek, sealed, { ...ctx, column: 'job_units.clean_text_enc' }),
    ).toThrow();
    expect(() => decryptField(dek, sealed, { ...ctx, ownerId: 'u-2' })).toThrow();
  });

  it('密钥不对时解密失败；DEK 长度必须为 32 字节；过短的密文直接拒绝', () => {
    const sealed = encryptField(generateDek(), 'secret', ctx);
    expect(() => decryptField(generateDek(), sealed, ctx)).toThrow();
    expect(() => encryptField(new Uint8Array(16), 'x', ctx)).toThrow('32');
    expect(() => decryptField(generateDek(), new Uint8Array(10), ctx)).toThrow('长度不足');
  });
});
