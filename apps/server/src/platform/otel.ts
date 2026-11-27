/**
 * OpenTelemetry 初始化（02 §3.2 第 2 步、§13；05 §4.2：关闭会记录 SQL 参数、HTTP 请求体或 URL 查询串的选项）。
 * 不使用 auto-instrumentations-node：其依赖树带入 BlueOak 许可证（GCP 资源探测器 → gaxios → rimraf → glob），
 * 许可证策略待负责人决定（ADR 0017 约束 6），因此只装需要的插桩。未配置 OTLP 端点时不启动。
 */
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { NodeSDK } from '@opentelemetry/sdk-node';

/** 只保留路由模板，不记录查询串（查询串可能含签名 URL 参数或用户输入） */
export function sanitizeUrlForSpan(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function createInstrumentations() {
  return [
    new HttpInstrumentation({
      // 不采集请求与响应头（含 Authorization、Cookie、签名）
      headersToSpanAttributes: { server: { requestHeaders: [], responseHeaders: [] } },
      ignoreIncomingRequestHook: (req) => req.url === '/v1/healthz' || req.url === '/v1/readyz',
      requestHook: (span, req) => {
        const url = 'url' in req && typeof req.url === 'string' ? req.url : '';
        span.setAttribute('url.path', sanitizeUrlForSpan(url));
      },
    }),
    new PinoInstrumentation(),
  ];
}

/** 返回已启动的 SDK；未配置端点时返回 undefined（本地与测试默认不启用） */
export function startTelemetry(
  endpoint: string | undefined,
  serviceName: string,
): NodeSDK | undefined {
  if (!endpoint) return undefined;
  const sdk = new NodeSDK({ serviceName, instrumentations: createInstrumentations() });
  sdk.start();
  return sdk;
}
