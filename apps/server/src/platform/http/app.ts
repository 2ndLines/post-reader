/**
 * Fastify 工厂（02 §4.1）：requestContext → helmet → 路由 → errorHandler。
 * 版本门控（clientVersionGuard）依赖 config/clients.yaml，随该配置一起引入（P2 后续卡）；认证、签名、Attest、
 * 频控、幂等在各自的卡中按 §4.1 顺序挂载。
 */
import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import { type ErrorCode, Health, PROBLEM_CONTENT_TYPE } from '@post-reader/contracts';
import Fastify, { type FastifyError, type FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { AppError } from './errors.ts';
import { RequestValidationError, zodSerializerCompiler, zodValidatorCompiler } from './zod.ts';

declare module 'fastify' {
  interface FastifyRequest {
    clientVersion: string | undefined;
    /** 原始请求体：请求签名对它计算摘要（02 §4.1：自定义 contentTypeParser 同时保留 rawBody） */
    rawBody: Buffer | undefined;
  }
}

const TITLES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: '请求校验失败',
  NOT_FOUND: '资源不存在',
  INTERNAL: '服务器内部错误',
};

export interface Readiness {
  /** 依赖就绪且未进入停机时为 true */
  ready: boolean;
}

function sendProblem(reply: FastifyReply, status: number, code: ErrorCode, detail?: string) {
  const body = {
    type: 'about:blank',
    title: TITLES[code] ?? code,
    status,
    code,
    traceId: reply.request.id,
    ...(detail ? { detail } : {}),
  };
  return reply.status(status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(body));
}

export async function buildApp(options: { logger: Logger; readiness: Readiness }) {
  const app = Fastify({
    loggerInstance: options.logger,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    disableRequestLogging: false,
  });
  app.setValidatorCompiler(zodValidatorCompiler);
  app.setSerializerCompiler(zodSerializerCompiler);
  app.decorateRequest('clientVersion', undefined);
  app.decorateRequest('rawBody', undefined);
  // JSON 请求体：保留原始字节供签名校验；空请求体视为没有 body（例如 POST /auth/logout）
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const raw = body as Buffer;
    request.rawBody = raw;
    if (raw.length === 0) return done(null, undefined);
    try {
      done(null, JSON.parse(raw.toString('utf8')));
    } catch {
      const error = new Error('invalid json') as Error & { statusCode: number };
      error.statusCode = 400;
      done(error, undefined);
    }
  });

  // 1 requestContext：requestId 回写响应头；读取 X-Client-Version
  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers['x-client-version'];
    request.clientVersion = typeof header === 'string' ? header : undefined;
    reply.header('x-request-id', request.id);
  });
  // 2 安全响应头
  await app.register(helmet);

  app.setNotFoundHandler((_request, reply) => sendProblem(reply, 404, 'NOT_FOUND'));
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError)
      return sendProblem(reply, error.status, error.code, error.detail);
    if (error instanceof RequestValidationError) {
      return sendProblem(reply, 400, 'VALIDATION_FAILED', `字段：${error.paths.join(', ')}`);
    }
    if (error.validation || error.statusCode === 400 || error.statusCode === 415) {
      return sendProblem(reply, 400, 'VALIDATION_FAILED');
    }
    // 未知错误：只记录类型与调用栈，不记录 message（可能夹带用户输入），也不回传给客户端
    request.log.error(
      { errType: error.name, stack: error.stack?.split('\n').slice(1).join('\n') },
      'unhandled error',
    );
    return sendProblem(reply, 500, 'INTERNAL');
  });

  await app.register(
    async (v1) => {
      v1.get('/healthz', { schema: { response: { 200: Health } } }, async () => ({
        status: 'ok' as const,
      }));
      v1.get('/readyz', { schema: { response: { 200: Health } } }, async (_request, reply) => {
        if (!options.readiness.ready) return sendProblem(reply, 503, 'INTERNAL', 'not ready');
        return { status: 'ok' as const };
      });
    },
    { prefix: '/v1' },
  );
  return app;
}

/** SIGTERM：/readyz 立即变为 503，再优雅关闭（02 §3.2 第 5 步、§14.3） */
export type App = Awaited<ReturnType<typeof buildApp>>;

export function installShutdown(
  app: App,
  readiness: Readiness,
  signal: NodeJS.Signals = 'SIGTERM',
) {
  process.once(signal, () => {
    readiness.ready = false;
    void app.close();
  });
}
