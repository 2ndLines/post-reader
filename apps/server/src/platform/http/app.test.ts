import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLogger } from '../logger.ts';
import { buildApp } from './app.ts';
import { AppError } from './errors.ts';

async function setup() {
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _e, done) {
      logs.push(String(chunk));
      done();
    },
  });
  const readiness = { ready: true };
  const app = await buildApp({
    logger: createLogger({ level: 'info', region: 'intl', roles: ['bff'] }, stream),
    readiness,
  });
  app.get('/boom', async () => {
    throw new Error('secret user content in message');
  });
  app.get('/quota', async () => {
    throw new AppError('QUOTA_EXHAUSTED', 402);
  });
  app.post(
    '/echo',
    {
      schema: {
        body: z.object({ name: z.string().min(2).max(20) }),
        response: { 200: z.object({ name: z.string() }) },
      },
    },
    async (request) => ({ ...(request.body as { name: string }), leaked: 'internal-field' }),
  );
  app.get('/version', async (request) => ({ v: request.clientVersion ?? null }));
  await app.ready();
  return { app, readiness, logs };
}

describe('HTTP 层（02 §4.1、§12；00 §4.4）', () => {
  it('健康检查', async () => {
    const { app } = await setup();
    const res = await app.inject('/v1/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('停机后 /readyz 返回 503 problem+json', async () => {
    const { app, readiness } = await setup();
    expect((await app.inject('/v1/readyz')).statusCode).toBe(200);
    readiness.ready = false;
    const res = await app.inject('/v1/readyz');
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('404 为 NOT_FOUND，traceId 与响应头 x-request-id 一致', async () => {
    const { app } = await setup();
    const res = await app.inject('/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND', status: 404, type: 'about:blank' });
    expect(res.json().traceId).toBe(res.headers['x-request-id']);
  });

  it('AppError 转为对应的 code 与状态码', async () => {
    const { app } = await setup();
    const res = await app.inject('/quota');
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ code: 'QUOTA_EXHAUSTED' });
  });

  it('未知错误：返回 INTERNAL，响应与日志都不含错误信息原文', async () => {
    const { app, logs } = await setup();
    const res = await app.inject('/boom');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'INTERNAL' });
    expect(res.body).not.toContain('secret user content');
    expect(logs.join('')).not.toContain('secret user content');
    expect(logs.join('')).toContain('unhandled error');
  });

  it('请求校验失败：VALIDATION_FAILED，detail 只含字段路径，不回显内容', async () => {
    const { app } = await setup();
    const privateValue = 'user-private-value-that-is-too-long';
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { name: privateValue } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED', detail: '字段：body.name' });
    expect(res.body).not.toContain(privateValue);
  });

  it('请求体不是 JSON：VALIDATION_FAILED', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('响应 schema 是字段白名单：未声明的字段被丢弃', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { name: 'ok-name' } });
    expect(res.json()).toEqual({ name: 'ok-name' });
  });

  it('安全响应头与 X-Client-Version', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/version', headers: { 'x-client-version': '1.2.3' } });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.json()).toEqual({ v: '1.2.3' });
  });
});
