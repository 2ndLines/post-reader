/**
 * 环境变量校验（02 §3.2 第 1 步、§3.3）：启动时校验，失败即退出。
 * 错误信息只包含变量名与问题，不包含变量值（值可能是凭据或连接串）。
 * 密钥类变量只存「引用」（*_REF），实际值由各模块启动时从区域凭据服务读取。
 */
import { Region } from '@post-reader/contracts';
import { z } from 'zod';

const ROLES = ['bff', 'orchestrator', 'audio-worker', 'admin-api'] as const;
export type Role = (typeof ROLES)[number];

const roleList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.enum(ROLES))
      .min(1)
      .refine((r) => new Set(r).size === r.length, '角色不能重复'),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ROLES: roleList,
  REGION: Region,
  // 0 = 由系统分配随机端口（仅用于测试）
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  DATABASE_ROLE: z.enum(['app_rw', 'admin_limited', 'migrator']).default('app_rw'),
  REDIS_URL: z.url(),
  // 以下在对应模块引入时启用（P2-SRV-02 起逐步改为必填）
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  KMS_KEY_ID: z.string().optional(),
  JWT_SIGNING_KEY_REF: z.string().optional(),
  CONFIG_BUNDLE_PUBKEYS: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  SENTRY_DSN: z.url().optional(),
});
export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`环境变量校验失败：${problems.join('；')}`);
    this.name = 'EnvError';
    this.problems = problems;
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (result.success) return result.data;
  // 只报告变量名与问题，不回显值
  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? '(未知)');
    return source[name] === undefined ? `${name} 缺失` : `${name} 不合法（${issue.code}）`;
  });
  throw new EnvError([...new Set(problems)]);
}
