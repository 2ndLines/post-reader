/**
 * 汇总生成公共 API 的 OpenAPI 文档（00 §3.1 openapi.ts；接口表见 02 §4.2，前缀 /v1）。
 * 生成物 dist/openapi.yaml 入库，`pnpm contracts:check` 在 CI 中校验与源一致；iOS 的 APIClient 消费其副本。
 * admin-api 契约不进入本文件。
 *
 * 使用前必须先引入 ./openapi-setup.ts，再用动态 import 加载本文件（原因见该文件）。
 * 本文件不从 index.ts 导出：服务端等运行时使用方不会引入 OpenAPI 补丁。
 */
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  AppleSignInRequest,
  AttestChallengeResponse,
  AttestVerifyRequest,
  AuthSession,
  EmailCodeRequest,
  EmailVerifyRequest,
  RefreshRequest,
  RefreshResponse,
} from './api/auth.ts';
import { AckRequest, CreateJobRequest, CreateJobResponse, JobStatus } from './api/jobs.ts';
import { DeleteAccountResponse, Me, QuotaReference, UpdateMeRequest } from './api/me.ts';
import {
  AppStoreNotification,
  ConfigBundleResponse,
  Health,
  SamplesResponse,
  SubscriptionSyncRequest,
  SubscriptionSyncResponse,
} from './api/misc.ts';
import { CanonicalPost } from './canonical-post.ts';
import { PROBLEM_CONTENT_TYPE, ProblemDetails } from './errors.ts';
import { Prefs } from './prefs.ts';

export const API_VERSION = '1.0.0';

type Auth = 'none' | 'jwt' | 'jwt+sig' | 'jwt+sig+attest' | 'refresh+attest' | 'apple-jws';

/** 请求签名（02 §10.3）与设备证明（02 §10.2）用到的请求头 */
const signatureHeaders = {
  'X-Ts': z.string().regex(/^\d+$/).meta({ description: '请求时间，Unix 毫秒（P1-CTR-02 Q2）' }),
  'X-Nonce': z.string().min(1).meta({ description: '一次性随机数，600 s 内不可重复' }),
  'X-Sig': z
    .string()
    .min(1)
    .meta({ description: 'base64url(HMAC-SHA256(k_sess, string_to_sign))' }),
};
const attestHeaders = {
  'X-Attest-Key-Id': z.string().min(1).meta({ description: 'App Attest keyId（P1-CTR-02 Q3）' }),
  'X-Attest-Assertion': z
    .string()
    .min(1)
    .meta({ description: 'App Attest assertion，base64（P1-CTR-02 Q3）' }),
};
const clientVersionHeader = {
  'X-Client-Version': z
    .string()
    .min(1)
    .meta({ description: '客户端版本；低于最低版本时返回 426 CLIENT_TOO_OLD' }),
};

function headersFor(auth: Auth, extra: Record<string, z.ZodType> = {}) {
  return z.object({
    ...clientVersionHeader,
    ...(auth.includes('sig') ? signatureHeaders : {}),
    ...(auth.includes('attest') ? attestHeaders : {}),
    ...extra,
  });
}

export function buildOpenApiDocument() {
  if (typeof (CanonicalPost as unknown as { openapi?: unknown }).openapi !== 'function') {
    throw new Error(
      '契约 schema 缺少 openapi()：必须先 import ./openapi-setup.ts，再动态 import ./openapi.ts',
    );
  }
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'accessToken（ES256）；refresh 与 Apple 通知各有单独的凭据',
  });

  registry.register('ProblemDetails', ProblemDetails);
  registry.register('CanonicalPost', CanonicalPost);
  registry.register('Prefs', Prefs);
  registry.register('AuthSession', AuthSession);
  registry.register('Me', Me);
  registry.register('JobStatus', JobStatus);

  const problem = {
    description: '错误（RFC 9457 problem+json）；客户端只按 code 分支处理',
    content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemDetails } },
  };
  const json = (schema: z.ZodType, description: string) => ({
    description,
    content: { 'application/json': { schema } },
  });
  const empty = (description: string) => ({ description });

  function route(spec: {
    method: 'get' | 'post' | 'patch' | 'delete';
    path: string;
    operationId: string;
    summary: string;
    auth: Auth;
    body?: z.ZodType;
    params?: z.ZodObject;
    extraHeaders?: Record<string, z.ZodType>;
    responses: Record<number, ReturnType<typeof json> | ReturnType<typeof empty>>;
  }) {
    registry.registerPath({
      method: spec.method,
      path: spec.path,
      operationId: spec.operationId,
      summary: spec.summary,
      ...(spec.auth.startsWith('jwt') ? { security: [{ [bearer.name]: [] }] } : { security: [] }),
      request: {
        headers: headersFor(spec.auth, spec.extraHeaders),
        ...(spec.params ? { params: spec.params } : {}),
        ...(spec.body
          ? { body: { required: true, content: { 'application/json': { schema: spec.body } } } }
          : {}),
      },
      responses: { ...spec.responses, default: problem },
    });
  }

  const jobId = z.object({
    id: z.string().min(1).meta({ description: '任务 ID' }),
  });

  route({
    method: 'post',
    path: '/auth/apple',
    operationId: 'signInWithApple',
    summary: 'Sign in with Apple',
    auth: 'none',
    body: AppleSignInRequest,
    responses: { 200: json(AuthSession, '登录成功') },
  });
  route({
    method: 'post',
    path: '/auth/email/code',
    operationId: 'sendEmailCode',
    summary: '发送邮箱验证码',
    auth: 'none',
    body: EmailCodeRequest,
    responses: { 204: empty('已发送') },
  });
  route({
    method: 'post',
    path: '/auth/email/verify',
    operationId: 'verifyEmailCode',
    summary: '邮箱验证码登录',
    auth: 'none',
    body: EmailVerifyRequest,
    responses: { 200: json(AuthSession, '登录成功') },
  });
  route({
    method: 'post',
    path: '/auth/refresh',
    operationId: 'refreshSession',
    summary: '刷新令牌（轮换 refresh token）',
    auth: 'refresh+attest',
    body: RefreshRequest,
    responses: { 200: json(RefreshResponse, '新的令牌对') },
  });
  route({
    method: 'post',
    path: '/auth/logout',
    operationId: 'logout',
    summary: '退出登录',
    auth: 'jwt+sig',
    responses: { 204: empty('已退出') },
  });
  route({
    method: 'post',
    path: '/attest/challenge',
    operationId: 'createAttestChallenge',
    summary: '获取 App Attest 挑战',
    auth: 'jwt',
    responses: { 200: json(AttestChallengeResponse, '一次性挑战') },
  });
  route({
    method: 'post',
    path: '/attest/verify',
    operationId: 'verifyAttestation',
    summary: '提交 App Attest 证明',
    auth: 'jwt',
    body: AttestVerifyRequest,
    responses: { 204: empty('已验证') },
  });
  route({
    method: 'get',
    path: '/me',
    operationId: 'getMe',
    summary: '账户、档位、额度与开关',
    auth: 'jwt',
    responses: { 200: json(Me, '当前账户') },
  });
  route({
    method: 'patch',
    path: '/me',
    operationId: 'updateMe',
    summary: '更新计费时区（30 天内只能改一次）',
    auth: 'jwt+sig',
    body: UpdateMeRequest,
    responses: { 200: json(Me, '更新后的账户') },
  });
  route({
    method: 'get',
    path: '/quota/reference',
    operationId: 'getQuotaReference',
    summary: '本档位的参考消耗',
    auth: 'jwt',
    responses: { 200: json(QuotaReference, '参考消耗') },
  });
  route({
    method: 'delete',
    path: '/account',
    operationId: 'deleteAccount',
    summary: '注销账号（需近 5 分钟内重新认证）',
    auth: 'jwt+sig',
    responses: { 202: json(DeleteAccountResponse, '已受理') },
  });
  route({
    method: 'post',
    path: '/jobs',
    operationId: 'createJob',
    summary: '创建生成任务',
    auth: 'jwt+sig+attest',
    body: CreateJobRequest,
    extraHeaders: {
      'Idempotency-Key': z.string().min(1).meta({ description: '同一键重放返回 200 与原任务' }),
    },
    responses: { 201: json(CreateJobResponse, '已创建'), 200: json(CreateJobResponse, '幂等重放') },
  });
  route({
    method: 'get',
    path: '/jobs/{id}',
    operationId: 'getJob',
    summary: '任务状态',
    auth: 'jwt',
    params: jobId,
    responses: { 200: json(JobStatus, '任务状态') },
  });
  route({
    method: 'post',
    path: '/jobs/{id}/cancel',
    operationId: 'cancelJob',
    summary: '取消任务',
    auth: 'jwt+sig',
    params: jobId,
    responses: { 204: empty('已取消') },
  });
  route({
    method: 'post',
    path: '/jobs/{id}/ack',
    operationId: 'ackJob',
    summary: '确认已播放到的下行序号',
    auth: 'jwt+sig',
    params: jobId,
    body: AckRequest,
    responses: { 204: empty('已确认') },
  });
  route({
    method: 'get',
    path: '/samples',
    operationId: 'listSamples',
    summary: '预置样帖',
    auth: 'jwt',
    responses: { 200: json(SamplesResponse, '样帖列表') },
  });
  route({
    method: 'get',
    path: '/config/bundle',
    operationId: 'getConfigBundle',
    summary: 'client 类配置包与签名',
    auth: 'jwt',
    extraHeaders: {
      'If-None-Match': z.string().optional().meta({ description: '上次的 ETag' }),
    },
    responses: { 200: json(ConfigBundleResponse, '配置包'), 304: empty('未变化') },
  });
  route({
    method: 'post',
    path: '/subscriptions/sync',
    operationId: 'syncSubscription',
    summary: '同步 StoreKit 交易',
    auth: 'jwt+sig',
    body: SubscriptionSyncRequest,
    responses: { 200: json(SubscriptionSyncResponse, '最新档位与额度') },
  });
  route({
    method: 'post',
    path: '/webhooks/app-store',
    operationId: 'appStoreNotification',
    summary: 'App Store 服务器通知（Apple JWS）',
    auth: 'apple-jws',
    body: AppStoreNotification,
    responses: { 200: empty('已接收') },
  });
  route({
    method: 'get',
    path: '/healthz',
    operationId: 'healthz',
    summary: '存活',
    auth: 'none',
    responses: { 200: json(Health, '存活') },
  });
  route({
    method: 'get',
    path: '/readyz',
    operationId: 'readyz',
    summary: '就绪',
    auth: 'none',
    responses: { 200: json(Health, '就绪') },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Post&Comments Reader 公共 API',
      version: API_VERSION,
      description: '由 packages/contracts 生成，请勿手改。接口表见 docs/archs/02-backend.md §4.2。',
    },
    servers: [{ url: '/v1' }],
  });
}
