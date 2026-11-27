/**
 * pino 日志（02 §13.1、05 §4.2、根 AGENTS.md 红线）：redact 路径固定，不可由调用方缩减。
 * 注意：pino 的 `*` 只匹配一层，所以请求体整体用 `req.body` 屏蔽；业务代码不得把正文、URL、邮箱等放进日志对象，
 * redact 只是兜底。
 */

import type { Region } from '@post-reader/contracts';
import pino, { type Logger, type LoggerOptions } from 'pino';
import type { Role } from './env.ts';

export const REDACT_PATHS = [
  'req.body',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-sig"]',
  'req.headers["x-attest-assertion"]',
  '*.cookie',
  '*.cleanText',
  '*.text',
  '*.translatedText',
  '*.url',
  '*.email',
  '*.identityToken',
  '*.refreshToken',
  '*.accessToken',
  '*.sessionKey',
] as const;

export function createLogger(
  options: { level: string; region: Region; roles: Role[] },
  destination?: pino.DestinationStream,
): Logger {
  const config: LoggerOptions = {
    level: options.level,
    base: { region: options.region, role: options.roles.join(',') },
    redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return destination ? pino(config, destination) : pino(config);
}
