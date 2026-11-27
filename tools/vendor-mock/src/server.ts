/**
 * 厂商 mock 服务（05 §3.2：默认回放；录制只在负责人授权的任务中、用预发密钥运行）。
 * 控制接口（只给测试用）：PUT /__mock/faults 设置故障规则；DELETE /__mock/faults 清除；
 * GET /__mock/requests 查看已收到的请求（只有方法、路径与请求体摘要，没有请求体原文）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Fault, type FaultRule, FaultTable } from './faults.ts';
import { type Fixture, findFixture, sha256Hex } from './fixtures.ts';

export interface MockOptions {
  mode: 'replay' | 'record';
  fixtures: Fixture[];
  /** 录制模式：真实上游的基础地址 */
  upstream?: string;
  /** 录制模式：新样本的写入目录 */
  recordDir?: string;
  /** 录制模式必须显式确认（VENDOR_MOCK_RECORD_CONFIRM=yes），防止无意中用真实密钥调用厂商 */
  recordConfirmed?: boolean;
  vendor?: string;
}

/** 录制时不写入样本的响应头（fetch 已解压正文，content-encoding 若保留会让回放的正文与头不符） */
const DROPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'content-encoding',
  'authorization',
  'x-api-key',
  'content-length',
  'transfer-encoding',
  'connection',
  'date',
]);
/** 转发给上游时不带的请求头 */
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function buildMockServer(options: MockOptions) {
  if (
    options.mode === 'record' &&
    (!options.recordConfirmed || !options.upstream || !options.recordDir)
  ) {
    throw new Error('录制模式需要 upstream、recordDir，并显式确认 VENDOR_MOCK_RECORD_CONFIRM=yes');
  }
  const app = Fastify({ logger: false });
  const faults = new FaultTable();
  const received: { method: string; path: string; bodySha256: string }[] = [];
  const fixtures = [...options.fixtures];

  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.put('/__mock/faults', async (request, reply) => {
    faults.set(JSON.parse(String(request.body ?? '[]')) as FaultRule[]);
    return reply.status(204).send();
  });
  app.delete('/__mock/faults', async (_request, reply) => {
    faults.clear();
    return reply.status(204).send();
  });
  app.get('/__mock/requests', async () => received);

  async function applyFault(
    fault: Fault,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> {
    if (fault.kind === 'latency') {
      await sleep(fault.ms);
      return false;
    }
    if (fault.kind === 'status') {
      await reply.status(fault.status).send({ error: 'injected', status: fault.status });
      return true;
    }
    if (fault.kind === 'reset') {
      request.raw.socket.destroy();
      reply.hijack();
      return true;
    }
    // timeout：不响应，客户端断开时释放
    reply.hijack();
    await new Promise<void>((resolve) => request.raw.socket.once('close', () => resolve()));
    return true;
  }

  async function sendFixture(fixture: Fixture, reply: FastifyReply) {
    if (fixture.latencyMs) await sleep(fixture.latencyMs);
    const { response } = fixture;
    if (response.chunks) {
      reply.hijack();
      reply.raw.writeHead(response.status, response.headers ?? {});
      for (const chunk of response.chunks) {
        if (chunk.delayMs) await sleep(chunk.delayMs);
        if (reply.raw.destroyed) return;
        reply.raw.write(chunk.data);
      }
      reply.raw.end();
      return;
    }
    reply.status(response.status).headers(response.headers ?? {});
    if (response.bodyBase64 !== undefined)
      return reply.send(Buffer.from(response.bodyBase64, 'base64'));
    return reply.send(response.body ?? null);
  }

  async function record(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    body: Buffer,
    bodySha256: string,
  ) {
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(
        ([k, v]) => !HOP_BY_HOP.has(k) && typeof v === 'string',
      ) as [string, string][],
    );
    const upstream = await fetch(new URL(request.url, options.upstream), {
      method: request.method,
      headers,
      ...(body.length > 0 ? { body } : {}),
    });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    const responseHeaders = Object.fromEntries(
      [...upstream.headers.entries()].filter(
        ([k]) => !DROPPED_RESPONSE_HEADERS.has(k.toLowerCase()),
      ),
    );
    const contentType = upstream.headers.get('content-type') ?? '';
    const fixture: Fixture = {
      name: `${request.method.toLowerCase()}${path.replaceAll('/', '_')}-${bodySha256.slice(0, 12)}`,
      vendor: options.vendor ?? 'recorded',
      request: { method: request.method, path, bodySha256 },
      response: {
        status: upstream.status,
        headers: responseHeaders,
        ...(contentType.includes('json')
          ? { body: JSON.parse(bytes.toString('utf8')) }
          : { bodyBase64: bytes.toString('base64') }),
      },
    };
    mkdirSync(options.recordDir as string, { recursive: true });
    writeFileSync(
      join(options.recordDir as string, `${fixture.name}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
    fixtures.push(fixture);
    return reply.status(upstream.status).headers(responseHeaders).send(bytes);
  }

  app.all('/*', async (request, reply) => {
    const q = request.url.indexOf('?');
    const path = q === -1 ? request.url : request.url.slice(0, q);
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const bodySha256 = sha256Hex(body);
    received.push({ method: request.method, path, bodySha256 });

    const fault = faults.take(path);
    if (fault && (await applyFault(fault, request, reply))) return;

    if (options.mode === 'record') return record(request, reply, path, body, bodySha256);
    const fixture = findFixture(fixtures, request.method, path, bodySha256);
    if (!fixture)
      return reply
        .status(404)
        .send({ error: 'no_fixture', method: request.method, path, bodySha256 });
    return sendFixture(fixture, reply);
  });

  return app;
}
