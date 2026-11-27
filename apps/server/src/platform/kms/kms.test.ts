import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateDek } from '../crypto/field.ts';
import { DekCache } from './dek-cache.ts';
import { LocalFileKms } from './local.ts';

const masterKey = new Uint8Array(32).fill(7);

describe('LocalFileKms（只用于开发与测试）', () => {
  it('包裹与解包往返；包裹结果不等于明文 DEK', async () => {
    const kms = new LocalFileKms({ keyId: 'local-1', masterKey, nodeEnv: 'test' });
    const dek = generateDek();
    const wrapped = await kms.wrapDek(dek);
    expect(Buffer.from(wrapped).includes(Buffer.from(dek))).toBe(false);
    expect(Buffer.from(await kms.unwrapDek(wrapped)).equals(Buffer.from(dek))).toBe(true);
  });

  it('换了主密钥或 keyId，原来的包裹结果解不开', async () => {
    const wrapped = await new LocalFileKms({
      keyId: 'local-1',
      masterKey,
      nodeEnv: 'test',
    }).wrapDek(generateDek());
    const otherKey = new LocalFileKms({
      keyId: 'local-1',
      masterKey: new Uint8Array(32).fill(8),
      nodeEnv: 'test',
    });
    const otherId = new LocalFileKms({ keyId: 'local-2', masterKey, nodeEnv: 'test' });
    await expect(otherKey.unwrapDek(wrapped)).rejects.toThrow();
    await expect(otherId.unwrapDek(wrapped)).rejects.toThrow();
  });

  it('生产环境拒绝使用（生产必须用区域 KMS）', () => {
    expect(() => new LocalFileKms({ keyId: 'k', masterKey, nodeEnv: 'production' })).toThrow(
      '生产',
    );
  });

  it('从文件读取主密钥；格式不对时拒绝', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kms-'));
    writeFileSync(join(dir, 'ok.key'), `${'ab'.repeat(32)}\n`);
    writeFileSync(join(dir, 'bad.key'), 'not-hex');
    expect(LocalFileKms.fromFile(join(dir, 'ok.key'), 'k', 'development').keyId).toBe('k');
    expect(() => LocalFileKms.fromFile(join(dir, 'bad.key'), 'k', 'development')).toThrow(
      '十六进制',
    );
  });
});

describe('DekCache（02 §8：LRU，5 分钟）', () => {
  it('5 分钟后过期', () => {
    let now = 0;
    const cache = new DekCache({ now: () => now });
    cache.set('u', new Uint8Array(32));
    now = 5 * 60_000 - 1;
    expect(cache.get('u')).toBeDefined();
    now = 5 * 60_000 + 1;
    expect(cache.get('u')).toBeUndefined();
  });

  it('超过容量时淘汰最久未使用的', () => {
    const cache = new DekCache({ maxEntries: 2 });
    cache.set('a', new Uint8Array(32));
    cache.set('b', new Uint8Array(32));
    cache.get('a');
    cache.set('c', new Uint8Array(32));
    expect([cache.get('a'), cache.get('b'), cache.get('c')].map(Boolean)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('invalidate 后不再命中（注销时调用）', () => {
    const cache = new DekCache();
    cache.set('u', new Uint8Array(32));
    cache.invalidate('u');
    expect(cache.get('u')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
