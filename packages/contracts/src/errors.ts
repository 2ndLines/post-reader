/**
 * 错误码与 problem+json（00 §3.1 ErrorCode、§4.4）。
 * HTTP 错误响应为 RFC 9457 `application/problem+json`，含 `code` 与 `traceId`；WS 的 `job.failed.code` 复用同一枚举。
 * 客户端只按 `code` 分支处理，不解析 `detail`。HTTP 状态码由服务端决定，契约不定义 code → status 的映射。
 */
import { z } from 'zod';
import { UtcDateTime } from './common.ts';

export const ErrorCode = z.enum([
  'AUTH_EXPIRED',
  'SIGNATURE_INVALID',
  'REPLAY_DETECTED',
  'ATTEST_REQUIRED',
  /** 只表示令牌桶频控；当日次数上限用 DAILY_LIMIT */
  'RATE_LIMITED',
  'QUOTA_EXHAUSTED',
  'TIER_REQUIRED',
  'REGION_MISMATCH',
  'CONTENT_BLOCKED',
  'UPSTREAM_DEGRADED',
  'VALIDATION_FAILED',
  'CLIENT_TOO_OLD',
  /** 当日次数上限 R_daily；响应带 resetAt */
  'DAILY_LIMIT',
  'AUTH_REVOKED',
  'SERVICE_PAUSED',
  'BRANCH_DISABLED',
  'SITE_RULE_DISABLED',
  'NOT_FOUND',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export const ProblemDetails = z
  .object({
    /** RFC 9457 §3.1.1：缺省为 "about:blank" */
    type: z.string().default('about:blank'),
    title: z.string(),
    status: z.int().min(400).max(599),
    /** 只写字段路径等诊断信息，不回显用户内容（02 §12）；客户端不解析 */
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: ErrorCode,
    traceId: z.string().min(1),
    /** DAILY_LIMIT 时必填：次数重置时间（UTC） */
    resetAt: UtcDateTime.optional(),
  })
  .superRefine((problem, ctx) => {
    if (problem.code === 'DAILY_LIMIT' && problem.resetAt === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['resetAt'],
        message: 'DAILY_LIMIT 必须带 resetAt（00 §3.1）',
      });
    }
  });
export type ProblemDetails = z.infer<typeof ProblemDetails>;
