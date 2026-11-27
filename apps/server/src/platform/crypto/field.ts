/**
 * 字段加密（02 §10.4）：AES-256-GCM，iv 为 12 字节随机数，存储格式 `v1 | iv | ciphertext | tag`。
 * 受保护路径（playbook §9.4）。
 *
 * 附加认证数据（AAD）绑定「表.列 + 行的所有者」，防止把一行的密文搬到另一行或另一列后仍能解密
 * （设计未明确规定 AAD，P2-SRV-04 Q1）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEK_BYTES = 32;

export interface FieldContext {
  /** 例如 users.email_enc */
  column: string;
  /** 行的所有者，通常是 userId */
  ownerId: string;
}

function aad(context: FieldContext): Buffer {
  return Buffer.from(`${context.column}\u0000${context.ownerId}`, 'utf8');
}

function assertDek(dek: Uint8Array): void {
  if (dek.length !== DEK_BYTES) throw new Error(`DEK 长度必须为 ${DEK_BYTES} 字节`);
}

export function encryptField(
  dek: Uint8Array,
  plaintext: string,
  context: FieldContext,
): Uint8Array {
  assertDek(dek);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', dek, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), iv, ciphertext, cipher.getAuthTag()]);
}

/** 密文被篡改、密钥不对或 AAD（列、所有者）不符时抛错，不返回部分明文 */
export function decryptField(dek: Uint8Array, sealed: Uint8Array, context: FieldContext): string {
  assertDek(dek);
  const data = Buffer.from(sealed);
  if (data.length < 1 + IV_BYTES + TAG_BYTES) throw new Error('密文长度不足');
  if (data[0] !== VERSION) throw new Error(`不支持的密文版本：${data[0]}`);
  const iv = data.subarray(1, 1 + IV_BYTES);
  const tag = data.subarray(data.length - TAG_BYTES);
  const ciphertext = data.subarray(1 + IV_BYTES, data.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', dek, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function generateDek(): Uint8Array {
  return randomBytes(DEK_BYTES);
}
