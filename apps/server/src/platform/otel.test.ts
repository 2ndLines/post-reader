import { describe, expect, it } from 'vitest';
import { createInstrumentations, sanitizeUrlForSpan, startTelemetry } from './otel.ts';

describe('OpenTelemetry（05 §4.2）', () => {
  it.each([
    ['/v1/jobs?sig=abc&expires=1', '/v1/jobs'],
    ['/v1/me', '/v1/me'],
  ])('span 中的 URL 去掉查询串：%s', (url, expected) => {
    expect(sanitizeUrlForSpan(url)).toBe(expected);
  });

  it('只启用 HTTP 与 pino 插桩，且不采集请求与响应头', () => {
    const instrumentations = createInstrumentations();
    expect(instrumentations.map((i) => i.instrumentationName)).toEqual([
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-pino',
    ]);
    const config = instrumentations[0]?.getConfig() as { headersToSpanAttributes?: unknown };
    expect(config.headersToSpanAttributes).toEqual({
      server: { requestHeaders: [], responseHeaders: [] },
    });
  });

  it('未配置 OTLP 端点时不启动', () => {
    expect(startTelemetry(undefined, 'server')).toBeUndefined();
  });
});
