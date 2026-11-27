import type { ErrorCode } from '@post-reader/contracts';

/** 业务错误（02 §12）：由 errorHandler 转为 problem+json；detail 只写字段路径等诊断信息，不回显用户内容 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: string | undefined;
  readonly retryable: boolean;
  /** 只用于 DAILY_LIMIT：次数重置时间（UTC，ISO 8601；00 §3.1 要求必带） */
  resetAt: string | undefined;

  constructor(code: ErrorCode, status: number, detail?: string, retryable = false) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
    this.resetAt = undefined;
  }
}

/** R_daily 超限（02 §11.3）：429 DAILY_LIMIT，带 resetAt = 计费时区的次日 0 点 */
export function dailyLimitError(resetAt: Date): AppError {
  const error = new AppError('DAILY_LIMIT', 429);
  error.resetAt = resetAt.toISOString();
  return error;
}
