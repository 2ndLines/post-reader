import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, REDACT_PATHS } from './logger.ts';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const logger = createLogger({ level: 'info', region: 'intl', roles: ['bff'] }, stream);
  return { logger, last: () => JSON.parse(lines.at(-1) ?? '{}') };
}

const SECRET = 'should-never-appear';

describe('日志脱敏（02 §13.1，根 AGENTS.md 红线）', () => {
  it('覆盖 02 §13.1 与 05 §4.2 列出的全部路径', () => {
    for (const path of [
      'req.body',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.cleanText',
      '*.text',
      '*.translatedText',
      '*.url',
      '*.email',
      '*.identityToken',
      '*.refreshToken',
      '*.cookie',
    ]) {
      expect(REDACT_PATHS).toContain(path);
    }
  });

  it.each([
    'cleanText',
    'text',
    'translatedText',
    'url',
    'email',
    'identityToken',
    'refreshToken',
    'accessToken',
    'sessionKey',
    'cookie',
  ])('字段 %s 被屏蔽', (field) => {
    const { logger, last } = capture();
    logger.info({ unit: { [field]: SECRET } }, 'event');
    expect(JSON.stringify(last())).not.toContain(SECRET);
    expect(last().unit[field]).toBe('[REDACTED]');
  });

  it('请求体整体屏蔽（嵌套任意深度的正文也不会进入日志）', () => {
    const { logger, last } = capture();
    logger.info({
      req: {
        body: { post: { units: [{ cleanText: SECRET }] } },
        headers: { authorization: `Bearer ${SECRET}` },
      },
    });
    expect(JSON.stringify(last())).not.toContain(SECRET);
  });

  it('每条日志带 region 与 role', () => {
    const { logger, last } = capture();
    logger.info('x');
    expect(last()).toMatchObject({ region: 'intl', role: 'bff' });
  });
});
