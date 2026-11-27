import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clean, unitHash } from '@post-reader/canonical-spec';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  AttestProvider,
  Branch,
  CacheScope,
  CanonicalPost,
  Density,
  Emotion,
  ErrorCode,
  Jurisdiction,
  LangTag,
  Platform,
  ProblemDetails,
  Region,
  StoreProvider,
  Style,
  Tier,
  Weight,
} from './index.ts';

/** 从 00 §3.1「基础枚举」表中读出某个类型的取值：取单元格中的反引号内容，忽略全角括号内的说明 */
const overview = readFileSync(
  resolve(import.meta.dirname, '../../../docs/archs/00-overview.md'),
  'utf8',
);
function documentedValues(typeName: string): string[] {
  const row = overview.split('\n').find((line) => line.startsWith(`| \`${typeName}\` |`));
  if (!row) throw new Error(`00 §3.1 中找不到 ${typeName}`);
  const cell = (row.split('|')[2] ?? '').replace(/（[^）]*）/g, '');
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
}

describe('基础枚举与 00 §3.1 表格一致（文档即来源）', () => {
  it.each([
    ['Region', Region],
    ['Platform', Platform],
    ['StoreProvider', StoreProvider],
    ['AttestProvider', AttestProvider],
    ['Jurisdiction', Jurisdiction],
    ['Tier', Tier],
    ['CacheScope', CacheScope],
    ['Emotion', Emotion],
    ['Density', Density],
    ['Weight', Weight],
    ['Style', Style],
    ['Branch', Branch],
    ['ErrorCode', ErrorCode],
  ] as const)('%s', (name, schema) => {
    expect(schema.options).toEqual(documentedValues(name));
  });
});

async function unit(fields: {
  unitId: string;
  kind: 'post' | 'comment';
  authorId: string;
  raw: string;
  parentId?: string;
}) {
  const cleanText = clean(fields.raw);
  return {
    unitId: fields.unitId,
    kind: fields.kind,
    authorId: fields.authorId,
    ...(fields.parentId === undefined ? {} : { parentId: fields.parentId }),
    parentConfidence: 'high' as const,
    cleanText,
    hasImages: false,
    hasVideo: false,
    hash: await unitHash(fields.unitId, fields.authorId, cleanText),
  };
}

async function validPost() {
  return {
    schemaVersion: 1,
    source: {
      site: 'example-forum',
      url: 'https://forum.example.com/t/123',
      postId: '123',
      fetchedAt: '2026-11-26T08:00:00Z',
      cacheScope: 'PUBLIC',
    },
    langHint: 'zh-CN',
    units: [
      await unit({ unitId: 'post', kind: 'post', authorId: 'u_1', raw: '主帖&amp;正文\r\n' }),
      await unit({ unitId: 'c_1', kind: 'comment', authorId: 'u_2', raw: '第一条评论' }),
      await unit({
        unitId: 'c_2',
        kind: 'comment',
        authorId: 'anon:c_2',
        raw: '回复',
        parentId: 'c_1',
      }),
    ],
  };
}

function issuePaths(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('CanonicalPost', () => {
  it('合法样例通过；cleanText 与 hash 由 canonical-spec 生成', async () => {
    const post = await validPost();
    const parsed = CanonicalPost.parse(post);
    expect(parsed.units[0]?.cleanText).toBe('主帖&正文');
  });

  it('未知字段被丢弃而不是报错（只增可选字段的兼容规则）', async () => {
    const parsed = CanonicalPost.parse({ ...(await validPost()), futureField: 1 });
    expect(parsed).not.toHaveProperty('futureField');
  });

  type Sample = Awaited<ReturnType<typeof validPost>>;
  /** 按点分路径写入新值；值为函数时先以原样本求值（例如把现有 hash 转大写） */
  function setPath(post: Sample, path: string, value: unknown): Sample {
    const keys = path.split('.');
    const last = keys.pop() as string;
    let target = post as unknown as Record<string, unknown>;
    for (const key of keys) target = target[key] as Record<string, unknown>;
    target[last] = typeof value === 'function' ? value(post) : value;
    return post;
  }

  it.each([
    ['units[0] 不是主帖', 'units.0.unitId', 'x', 'units.0'],
    ['主帖带 parentId', 'units.0.parentId', 'c_1', 'units.0.parentId'],
    ['unitId 重复', 'units.2.unitId', 'c_1', 'units.2.unitId'],
    ['评论的 kind 写成 post', 'units.1.kind', 'post', 'units.1.kind'],
    ['parentId 指向不存在的单元', 'units.2.parentId', 'c_9', 'units.2.parentId'],
    ['parentId 指向自己', 'units.2.parentId', 'c_2', 'units.2.parentId'],
    ['hash 为大写', 'units.1.hash', (p: Sample) => p.units[1]?.hash.toUpperCase(), 'units.1.hash'],
    ['URL 无效', 'source.url', 'not a url', 'source.url'],
    [
      '时间带时区偏移（必须 UTC）',
      'source.fetchedAt',
      '2026-11-26T08:00:00+08:00',
      'source.fetchedAt',
    ],
    ['schemaVersion 不是 1', 'schemaVersion', 2, 'schemaVersion'],
    ['likes 为负数', 'units.1.likes', -1, 'units.1.likes'],
    ['likes 不是整数', 'units.1.likes', 1.5, 'units.1.likes'],
    ['langHint 不是 BCP 47', 'langHint', 'chinese simplified', 'langHint'],
  ] as const)('拒绝：%s', async (_name, path, value, issuePath) => {
    expect(issuePaths(CanonicalPost, setPath(await validPost(), path, value))).toContain(issuePath);
  });

  it('拒绝：没有任何单元', async () => {
    expect(issuePaths(CanonicalPost, { ...(await validPost()), units: [] })).toContain('units');
  });
});

describe('LangTag', () => {
  it.each(['zh-CN', 'en-US', 'zh-Hans-CN', 'yue', 'es-419'])('接受 %s', (tag) => {
    expect(LangTag.safeParse(tag).success).toBe(true);
  });
  it.each(['', 'z', 'zh_CN', 'zh-', '中文'])('拒绝 %j', (tag) => {
    expect(LangTag.safeParse(tag).success).toBe(false);
  });
});

describe('ProblemDetails（RFC 9457）', () => {
  const base = { title: '请求校验失败', status: 400, code: 'VALIDATION_FAILED', traceId: 't-1' };

  it('type 缺省为 about:blank', () => {
    expect(ProblemDetails.parse(base).type).toBe('about:blank');
  });

  it('DAILY_LIMIT 必须带 resetAt', () => {
    const limited = { ...base, status: 429, code: 'DAILY_LIMIT' };
    expect(issuePaths(ProblemDetails, limited)).toContain('resetAt');
    expect(ProblemDetails.safeParse({ ...limited, resetAt: '2026-11-27T00:00:00Z' }).success).toBe(
      true,
    );
  });

  it.each([
    ['status 不是错误码', { ...base, status: 200 }, 'status'],
    ['未知 code', { ...base, code: 'TEAPOT' }, 'code'],
    ['缺少 traceId', { title: 'x', status: 500, code: 'INTERNAL' }, 'traceId'],
  ])('拒绝：%s', (_name, input, path) => {
    expect(issuePaths(ProblemDetails, input)).toContain(path);
  });
});
