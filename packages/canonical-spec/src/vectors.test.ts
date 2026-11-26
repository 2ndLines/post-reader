/**
 * 黄金向量测试（SPEC.md §4）。expectedClean 由人工写出，expectedHash 由 scripts/expected_hash.py 独立计算，
 * 二者都不来自本实现，因此这里的通过才能说明实现符合规格。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clean, lp, SCHEMA_VERSION, sha256Hex, unitHash } from './index.ts';

interface Vector {
  name: string;
  raw: string;
  unitId: string;
  authorId: string;
  expectedClean: string;
  expectedHash: string;
  note?: string;
}

const REQUIRED_FILES = [
  'bidi',
  'cjk',
  'edge-cases',
  'emoji-zwj',
  'html-entities',
  'whitespace',
  'zero-width',
];
const vectorsDir = resolve(import.meta.dirname, '../vectors');
const files = readdirSync(vectorsDir)
  .filter((f) => f.endsWith('.json'))
  .sort();
const suites = files.map((file) => ({
  file: file.replace(/\.json$/, ''),
  vectors: JSON.parse(readFileSync(join(vectorsDir, file), 'utf8')) as Vector[],
}));

const ENTITY_LIKE = /&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|amp|lt|gt|quot|apos|nbsp);/;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('向量集本身', () => {
  it('包含 00 §3.2 规定的 7 类文件，每类至少 3 条', () => {
    expect(suites.map((s) => s.file)).toEqual(REQUIRED_FILES);
    for (const suite of suites) expect(suite.vectors.length, suite.file).toBeGreaterThanOrEqual(3);
  });

  it('向量名全局唯一，摘要为 64 位小写十六进制', () => {
    const names = suites.flatMap((s) => s.vectors.map((v) => v.name));
    expect(new Set(names).size).toBe(names.length);
    for (const v of suites.flatMap((s) => s.vectors))
      expect(v.expectedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('schemaVersion 为 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});

describe('清洗不是幂等的（SPEC.md §2 第 1 步）', () => {
  it('清洗结果中仍含实体形式的文本时，再清洗一次会再解码一层', () => {
    const once = clean('&amp;lt;');
    expect(once).toBe('&lt;');
    expect(clean(once)).toBe('<');
  });
});

describe('lp 与 SHA-256（SPEC.md §3，手算期望值）', () => {
  it.each([
    ['', '00000000'],
    ['ab', '000000026162'],
    ['你', '00000003e4bda0'],
    ['\u{1F44D}', '00000004f09f918d'],
  ])('lp(%j)', (value, expected) => {
    expect(hex(lp(value))).toBe(expected);
  });

  it('SHA-256 标准测试值 "abc"', async () => {
    const digest = await sha256Hex(new TextEncoder().encode('abc'));
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('字段边界参与摘要：交换内容不会得到相同摘要', async () => {
    expect(await unitHash('ab', 'c', 'x')).not.toBe(await unitHash('a', 'bc', 'x'));
  });
});

for (const suite of suites) {
  describe(`vectors/${suite.file}.json`, () => {
    it.each(suite.vectors.map((v) => [v.name, v] as const))('%s', async (_name, v) => {
      expect(clean(v.raw)).toBe(v.expectedClean);
      expect(await unitHash(v.unitId, v.authorId, v.expectedClean)).toBe(v.expectedHash);
      // 不含实体形式文本时清洗是幂等的；含有时不是（见下方「清洗不是幂等的」与 SPEC.md §2 第 1 步）
      if (!ENTITY_LIKE.test(v.expectedClean)) expect(clean(v.expectedClean)).toBe(v.expectedClean);
    });
  });
}
