import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type Fixture, loadFixtures, sha256Hex } from './fixtures.ts';
import { buildMockServer } from './server.ts';

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

async function start(
  fixtures: Fixture[],
  extra: Partial<Parameters<typeof buildMockServer>[0]> = {},
) {
  const app = await buildMockServer({ mode: 'replay', fixtures, ...extra });
  const base = await app.listen({ port: 0, host: '127.0.0.1' });
  closers.push(() => app.close());
  return base;
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const fx = (over: Partial<Fixture> & Pick<Fixture, 'request' | 'response'>): Fixture => ({
  name: 'f',
  vendor: 'v',
  ...over,
});

describe('回放', () => {
  it('请求体摘要完全一致的样本优先；否则用不限请求体的样本；都没有时 404 并给出指纹', async () => {
    const body = JSON.stringify({ prompt: 'a' });
    const base = await start([
      fx({
        request: { method: 'POST', path: '/v1/chat' },
        response: { status: 200, body: { which: 'wildcard' } },
      }),
      fx({
        request: { method: 'POST', path: '/v1/chat', bodySha256: sha256Hex(Buffer.from(body)) },
        response: { status: 200, body: { which: 'exact' } },
      }),
    ]);
    expect(await (await fetch(`${base}/v1/chat`, { ...json({}), body })).json()).toEqual({
      which: 'exact',
    });
    expect(await (await fetch(`${base}/v1/chat`, json({ prompt: 'b' }))).json()).toEqual({
      which: 'wildcard',
    });
    const miss = await fetch(`${base}/v1/other`, json({}));
    expect(miss.status).toBe(404);
    expect(await miss.json()).toMatchObject({ error: 'no_fixture', path: '/v1/other' });
  });

  it('二进制响应体原样返回（例如音频）', async () => {
    const audio = Buffer.from([0, 1, 2, 250, 255]);
    const base = await start([
      fx({
        request: { method: 'POST', path: '/tts' },
        response: {
          status: 200,
          headers: { 'content-type': 'audio/mp4' },
          bodyBase64: audio.toString('base64'),
        },
      }),
    ]);
    const res = await fetch(`${base}/tts`, json({}));
    expect(Buffer.from(await res.arrayBuffer()).equals(audio)).toBe(true);
  });

  it('样本的首字节时延生效', async () => {
    const base = await start([
      fx({
        request: { method: 'GET', path: '/slow' },
        response: { status: 200, body: {} },
        latencyMs: 150,
      }),
    ]);
    const started = performance.now();
    await fetch(`${base}/slow`);
    expect(performance.now() - started).toBeGreaterThanOrEqual(140);
  });

  it('流式响应：按顺序分块写出，每块之前等待 delayMs', async () => {
    const base = await start([
      fx({
        request: { method: 'POST', path: '/stream' },
        response: {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          chunks: [
            { delayMs: 0, data: 'data: 1\n\n' },
            { delayMs: 120, data: 'data: 2\n\n' },
          ],
        },
      }),
    ]);
    const started = performance.now();
    const res = await fetch(`${base}/stream`, json({}));
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    const firstAt = performance.now() - started;
    let rest = '';
    for (let r = await reader.read(); !r.done; r = await reader.read())
      rest += new TextDecoder().decode(r.value);
    expect(new TextDecoder().decode(first.value)).toBe('data: 1\n\n');
    expect(rest).toBe('data: 2\n\n');
    expect(performance.now() - started - firstAt).toBeGreaterThanOrEqual(100);
  });
});

describe('故障注入（经 /__mock/faults，被测代码无感知）', () => {
  const ok = [
    fx({
      request: { method: 'GET', path: '/v1/x' },
      response: { status: 200, body: { ok: true } },
    }),
  ];
  const setFaults = (base: string, rules: unknown) =>
    fetch(`${base}/__mock/faults`, { method: 'PUT', body: JSON.stringify(rules) });

  it('状态码：命中指定次数后恢复正常', async () => {
    const base = await start(ok);
    await setFaults(base, [
      { pathPrefix: '/v1', fault: { kind: 'status', status: 503 }, times: 2 },
    ]);
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await fetch(`${base}/v1/x`)).status);
    expect(statuses).toEqual([503, 503, 200]);
  });

  it('超时：一直不响应，客户端超时放弃', async () => {
    const base = await start(ok);
    await setFaults(base, [{ fault: { kind: 'timeout' } }]);
    await expect(fetch(`${base}/v1/x`, { signal: AbortSignal.timeout(200) })).rejects.toThrow();
  });

  it('断开连接：客户端收到网络错误', async () => {
    const base = await start(ok);
    await setFaults(base, [{ fault: { kind: 'reset' }, times: 1 }]);
    await expect(fetch(`${base}/v1/x`)).rejects.toThrow();
    expect((await fetch(`${base}/v1/x`)).status).toBe(200);
  });

  it('额外延迟后正常响应；DELETE 清除规则；请求记录只有方法、路径与摘要', async () => {
    const base = await start(ok);
    await setFaults(base, [{ fault: { kind: 'latency', ms: 120 } }]);
    const started = performance.now();
    expect((await fetch(`${base}/v1/x`)).status).toBe(200);
    expect(performance.now() - started).toBeGreaterThanOrEqual(110);
    await fetch(`${base}/__mock/faults`, { method: 'DELETE' });
    const log = (await (await fetch(`${base}/__mock/requests`)).json()) as Record<string, string>[];
    expect(log.at(-1)).toEqual({
      method: 'GET',
      path: '/v1/x',
      bodySha256: sha256Hex(Buffer.alloc(0)),
    });
  });
});

describe('录制（只在负责人授权的任务中使用）', () => {
  it('未显式确认时拒绝启动', async () => {
    await expect(
      buildMockServer({
        mode: 'record',
        fixtures: [],
        upstream: 'http://127.0.0.1:1',
        recordDir: tmpdir(),
      }),
    ).rejects.toThrow('VENDOR_MOCK_RECORD_CONFIRM');
  });

  it('转发到上游并保存样本：样本中没有请求头与密钥；之后回放得到同样的响应', async () => {
    const SECRET = 'sk-staging-should-never-be-saved';
    const upstream = Fastify();
    upstream.post('/v1/messages', async (request, reply) => {
      if (request.headers.authorization !== `Bearer ${SECRET}`)
        return reply.status(401).send({ error: 'no key' });
      return reply
        .header('set-cookie', 'session=abc')
        .send({ content: 'hello', usage: { input_tokens: 3 } });
    });
    const upstreamBase = await upstream.listen({ port: 0, host: '127.0.0.1' });
    closers.push(() => upstream.close());
    const recordDir = mkdtempSync(join(tmpdir(), 'record-'));
    const base = await start([], {
      mode: 'record',
      upstream: upstreamBase,
      recordDir,
      recordConfirmed: true,
      vendor: 'fake-llm',
    });

    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
      body: '{"q":1}',
    });
    expect(await res.json()).toEqual({ content: 'hello', usage: { input_tokens: 3 } });

    const files = readdirSync(recordDir);
    expect(files).toHaveLength(1);
    const saved = readFileSync(join(recordDir, files[0] as string), 'utf8');
    expect(saved).not.toContain(SECRET);
    expect(saved).not.toContain('session=abc');
    expect(saved).not.toContain('"q":1');

    const replay = await start(loadFixtures(recordDir));
    const again = await fetch(`${replay}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"q":1}',
    });
    expect(await again.json()).toEqual({ content: 'hello', usage: { input_tokens: 3 } });
  });
});

describe('样本加载', () => {
  it('格式不对或不是 JSON 时报错并给出文件名', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-'));
    writeFileSync(join(dir, 'bad.json'), '{"name":"x"}');
    expect(() => loadFixtures(dir)).toThrow('bad.json');
    const dir2 = mkdtempSync(join(tmpdir(), 'fx-'));
    writeFileSync(join(dir2, 'broken.json'), '{');
    expect(() => loadFixtures(dir2)).toThrow('broken.json');
  });

  it('仓库自带的示例样本可以加载', () => {
    expect(loadFixtures(join(import.meta.dirname, '../fixtures')).map((f) => f.name)).toContain(
      'example-echo',
    );
  });
});
