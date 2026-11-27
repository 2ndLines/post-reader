/**
 * /v1/jobs*（02 §4.2）。POST /jobs：JWT + 签名 + Attest + 幂等键，用户令牌桶；GET /jobs/{id}：JWT；POST /jobs/{id}/cancel：JWT + 签名。
 * POST /jobs/{id}/ack 触发私有缓存删除（《完整技术架构》§4.1），依赖切片存储，在 P3-PIPE-03 实现。
 * 本函数要与 authRoutes 注册在同一个作用域里（request.auth 与 attestedDeviceId 的装饰在 authRoutes 中声明）。
 */
import { CreateJobRequest, CreateJobResponse, JobStatus } from '@post-reader/contracts';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { AppError } from '../../platform/http/errors.ts';
import { enforceBucket, type RateLimits } from '../../platform/http/rate-limit.ts';
import { type AttestDeps, requireAttest } from '../auth/attest-guard.ts';
import { requireAuth } from '../auth/routes.ts';
import { sessions } from '../auth/schema.ts';
import type { AuthService } from '../auth/service.ts';
import { requireSignature, type SignatureDeps } from '../auth/signature-guard.ts';
import type { JobsService } from './service.ts';

export interface JobsRouteDeps {
  db: PostgresJsDatabase;
  redis: Redis;
  jobs: JobsService;
  auth: AuthService;
  signature: SignatureDeps;
  attest: AttestDeps;
  rateLimits: RateLimits;
}

const IdParams = z.object({ id: z.string().min(1) });
/** 幂等键：可打印 ASCII，1–128 个字符（P3-SRV-01 Q2） */
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,128}$/;

type Auth = NonNullable<FastifyRequest['auth']>;

export async function jobsRoutes(app: FastifyInstance, deps: JobsRouteDeps): Promise<void> {
  const authed = requireAuth(deps.auth);

  /** 设备证明必须来自本会话登录的设备（与 /auth/refresh 相同，P2-SRV-07） */
  const attestedDeviceMatchesSession = async (request: FastifyRequest) => {
    if (!deps.attest.enforce) return;
    const [session] = await deps.db
      .select({ deviceId: sessions.deviceId })
      .from(sessions)
      .where(eq(sessions.id, (request.auth as Auth).sid));
    if (!session || session.deviceId !== request.attestedDeviceId)
      throw new AppError('ATTEST_REQUIRED', 403, 'device');
  };

  app.post(
    '/jobs',
    {
      preHandler: [
        authed,
        requireSignature(deps.signature),
        requireAttest(deps.attest),
        attestedDeviceMatchesSession,
        async (request) =>
          enforceBucket(deps.redis, 'user', (request.auth as Auth).sub, deps.rateLimits.user),
      ],
      schema: {
        body: CreateJobRequest,
        response: { 200: CreateJobResponse, 201: CreateJobResponse },
      },
    },
    async (request, reply) => {
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key))
        throw new AppError('VALIDATION_FAILED', 400, 'Idempotency-Key');
      const auth = request.auth as Auth;
      const result = await deps.jobs.create(
        { userId: auth.sub, tier: auth.tier },
        request.body as z.infer<typeof CreateJobRequest>,
        request.rawBody ?? Buffer.alloc(0),
        key,
      );
      return reply
        .status(result.created ? 201 : 200)
        .send({ jobId: result.jobId, streamUrl: result.streamUrl });
    },
  );

  app.get(
    '/jobs/:id',
    { preHandler: authed, schema: { params: IdParams, response: { 200: JobStatus } } },
    async (request) =>
      deps.jobs.get((request.auth as Auth).sub, (request.params as z.infer<typeof IdParams>).id),
  );

  app.post(
    '/jobs/:id/cancel',
    { preHandler: [authed, requireSignature(deps.signature)], schema: { params: IdParams } },
    async (request, reply) => {
      await deps.jobs.cancel(
        (request.auth as Auth).sub,
        (request.params as z.infer<typeof IdParams>).id,
      );
      return reply.status(204).send();
    },
  );
}
