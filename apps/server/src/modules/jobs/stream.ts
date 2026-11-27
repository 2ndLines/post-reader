/**
 * 把 WS 网关（platform/ws/gateway.ts）接到认证与 jobs 模块（02 §4.3）。
 * hello 的签名与 HTTP 请求相同（02 §10.3；《完整技术架构》§10.3），按 `GET /v1/stream`、空查询串、空请求体计算（P3-SRV-02 Q1）。
 */
import type { Redis } from 'ioredis';
import type { GatewayDeps } from '../../platform/ws/gateway.ts';
import type { AuthService } from '../auth/service.ts';
import { type SignatureDeps, verifySignedParts } from '../auth/signature-guard.ts';
import type { JobsService } from './service.ts';

export const STREAM_PATH = '/v1/stream';

export function streamGatewayDeps(deps: {
  redis: Redis;
  createReader: () => Redis;
  auth: AuthService;
  signature: SignatureDeps;
  jobs: JobsService;
}): GatewayDeps {
  return {
    redis: deps.redis,
    createReader: deps.createReader,
    async authenticate(hello) {
      const claims = await deps.auth.authenticate(hello.accessToken);
      await verifySignedParts(deps.signature, claims, {
        method: 'GET',
        path: STREAM_PATH,
        query: [],
        ts: String(hello.ts),
        nonce: hello.nonce,
        sig: hello.sig,
        rawBody: new Uint8Array(),
      });
      return { userId: claims.sub, sid: claims.sid };
    },
    ownsJob: (userId, jobId) => deps.jobs.owns(userId, jobId),
    cancelJob: (userId, jobId) => deps.jobs.cancel(userId, jobId),
  };
}
