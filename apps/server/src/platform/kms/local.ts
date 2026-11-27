/**
 * 本地文件密钥模拟 KMS（playbook §6.4 P2-SRV-04：本地用文件密钥模拟 KMS）。只用于开发与测试：
 * NODE_ENV=production 时拒绝构造，生产必须用区域 KMS（私钥不出 KMS，红线「不弱化安全控制」）。
 * 包裹格式与字段加密相同（AES-256-GCM），AAD 绑定 keyId，换了主密钥的包裹结果无法解开。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Kms } from './types.ts';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export class LocalFileKms implements Kms {
  readonly keyId: string;
  readonly #masterKey: Buffer;

  constructor(options: { keyId: string; masterKey: Uint8Array; nodeEnv: string }) {
    if (options.nodeEnv === 'production') {
      throw new Error('LocalFileKms 不能在生产环境使用：生产必须使用区域 KMS');
    }
    if (options.masterKey.length !== 32) throw new Error('本地主密钥必须为 32 字节');
    this.keyId = options.keyId;
    this.#masterKey = Buffer.from(options.masterKey);
  }

  /** 从文件读取 64 位十六进制的主密钥（文件不入库，例如 .env.local 所在目录下的 kms-local.key） */
  static fromFile(path: string, keyId: string, nodeEnv: string): LocalFileKms {
    const hex = readFileSync(path, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('本地主密钥文件应为 64 位十六进制');
    return new LocalFileKms({ keyId, masterKey: Buffer.from(hex, 'hex'), nodeEnv });
  }

  async wrapDek(dek: Uint8Array): Promise<Uint8Array> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.#masterKey, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(this.keyId, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
    return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
  }

  async unwrapDek(wrapped: Uint8Array): Promise<Uint8Array> {
    const data = Buffer.from(wrapped);
    const iv = data.subarray(0, IV_BYTES);
    const tag = data.subarray(data.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.#masterKey, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(this.keyId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(data.subarray(IV_BYTES, data.length - TAG_BYTES)),
      decipher.final(),
    ]);
  }
}
