import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import './openapi-setup.ts';

// 必须在 openapi-setup 之后加载（zod 4 的 openapi() 只挂到补丁之后创建的 schema 上）
const { API_VERSION, buildOpenApiDocument } = await import('./openapi.ts');
const doc = buildOpenApiDocument();

type Operation = {
  operationId?: string;
  security?: Record<string, string[]>[];
  parameters?: { name: string; in: string; required?: boolean }[];
  requestBody?: unknown;
  responses: Record<string, { content?: Record<string, unknown> }>;
};
const paths = doc.paths as Record<string, Record<string, Operation>>;

/** 02 §4.2 接口表：每行第一列形如 `POST /auth/apple`，鉴权列给出 JWT / 签名 / Attest / 幂等键要求 */
const backend = readFileSync(
  resolve(import.meta.dirname, '../../../docs/archs/02-backend.md'),
  'utf8',
);
const table = backend.slice(
  backend.indexOf('### 4.2 接口明细'),
  backend.indexOf('**`POST /jobs` 服务端校验清单**'),
);
const documented = table
  .split('\n')
  .filter((line) => line.startsWith('| `'))
  .flatMap((line) => {
    const [, first = '', auth = ''] = line.split('|').map((cell) => cell.trim());
    return [...first.matchAll(/`(GET|POST|PATCH|DELETE) ([^`]+)`/g)].map((m) => ({
      method: (m[1] as string).toLowerCase(),
      path: m[2] as string,
      auth,
    }));
  });

describe('OpenAPI 文档与 02 §4.2 接口表一致（文档即来源）', () => {
  it('接口表解析出全部 20 个接口', () => {
    expect(documented).toHaveLength(20);
  });

  it.each(documented.map((d) => [`${d.method.toUpperCase()} ${d.path}`, d] as const))(
    '%s 已生成',
    (_n, d) => {
      expect(paths[d.path]?.[d.method]).toBeDefined();
    },
  );

  it.each(documented.map((d) => [`${d.method.toUpperCase()} ${d.path}`, d] as const))(
    '%s 的鉴权与签名头符合接口表',
    (_n, d) => {
      const op = paths[d.path]?.[d.method] as Operation;
      const headerNames = (op.parameters ?? []).filter((p) => p.in === 'header').map((p) => p.name);
      expect((op.security ?? []).length > 0, 'JWT').toBe(d.auth.startsWith('JWT'));
      expect(headerNames.includes('X-Sig'), '签名').toBe(d.auth.includes('签名'));
      expect(headerNames.includes('X-Attest-Assertion'), 'Attest').toBe(d.auth.includes('Attest'));
      expect(headerNames.includes('Idempotency-Key'), '幂等键').toBe(d.auth.includes('幂等键'));
    },
  );

  it('额外只有 02 §23.1 的 PATCH /me', () => {
    const generated = Object.entries(paths).flatMap(([p, ops]) =>
      Object.keys(ops).map((m) => `${m} ${p}`),
    );
    const extra = generated.filter((g) => !documented.some((d) => `${d.method} ${d.path}` === g));
    expect(extra).toEqual(['patch /me']);
  });
});

describe('OpenAPI 文档结构', () => {
  const operations = Object.values(paths).flatMap((ops) => Object.values(ops));

  it('info.version 与 API_VERSION、Swift 侧 APIContract.version 一致', () => {
    expect(doc.info.version).toBe(API_VERSION);
    const swift = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../apps/ios/Packages/APIClient/Sources/APIClient/APIClient.swift',
      ),
      'utf8',
    );
    expect(swift).toContain(`public static let version = "${API_VERSION}"`);
  });

  it('版本为 3.1.0，服务前缀 /v1', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: '/v1' }]);
  });

  it('operationId 齐全且唯一（Swift 客户端的方法名来自它）', () => {
    const ids = operations.map((op) => op.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个接口的默认响应都是 problem+json', () => {
    for (const op of operations) {
      expect(Object.keys(op.responses.default?.content ?? {})).toEqual([
        'application/problem+json',
      ]);
    }
  });

  it('每个接口都带 X-Client-Version（版本门控，02 §4.1 第 3 步）', () => {
    for (const op of operations) {
      expect(
        (op.parameters ?? []).some((p) => p.in === 'header' && p.name === 'X-Client-Version'),
      ).toBe(true);
    }
  });

  it('关键组件已命名', () => {
    expect(Object.keys(doc.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        'ProblemDetails',
        'CanonicalPost',
        'Prefs',
        'AuthSession',
        'Me',
        'JobStatus',
      ]),
    );
  });
});
