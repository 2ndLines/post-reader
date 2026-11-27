import type { ErrorCode } from '@post-reader/contracts';

/** 业务错误（02 §12）：由 errorHandler 转为 problem+json；detail 只写字段路径等诊断信息，不回显用户内容 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: string | undefined;
  readonly retryable: boolean;

  constructor(code: ErrorCode, status: number, detail?: string, retryable = false) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
  }
}
