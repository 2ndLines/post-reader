/**
 * 进程入口（02 §3.2 启动顺序）：
 * 1 校验环境变量（失败即退出）→ 2 OpenTelemetry → 3 PostgreSQL、Redis、配置包（P2-SRV-02、03 与配置包任务引入）
 * → 4 挂载角色 → 5 /readyz 就绪；SIGTERM 时 /readyz 立即 503 并优雅停机。
 */
import { EnvError, parseEnv } from '../platform/env.ts';
import { buildApp, installShutdown } from '../platform/http/app.ts';
import { createLogger } from '../platform/logger.ts';
import { startTelemetry } from '../platform/otel.ts';

let env: ReturnType<typeof parseEnv>;
try {
  env = parseEnv(process.env);
} catch (error) {
  // 环境变量错误只输出变量名，不输出值
  console.error(error instanceof EnvError ? error.message : '环境变量校验失败');
  process.exit(1);
}

const telemetry = startTelemetry(
  env.OTEL_EXPORTER_OTLP_ENDPOINT,
  `post-reader-${env.ROLES.join('+')}`,
);
const logger = createLogger({ level: env.LOG_LEVEL, region: env.REGION, roles: env.ROLES });
const readiness = { ready: false };
const app = await buildApp({ logger, readiness });
installShutdown(app, readiness);
app.addHook('onClose', async () => {
  await telemetry?.shutdown();
});

const address = await app.listen({ port: env.PORT, host: '0.0.0.0' });
readiness.ready = true;
logger.info({ address, roles: env.ROLES }, 'server started');
