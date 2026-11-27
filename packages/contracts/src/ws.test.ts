import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClientMsg, isSeqAdvance, parseClientMsg, parseServerMsg, ServerMsg } from './ws.ts';

const HASH = 'a'.repeat(64);

/** 从 00 §3.1 的 TS 代码块中读出上行、下行消息的 `t` 取值（文档即来源） */
const overview = readFileSync(
  resolve(import.meta.dirname, '../../../docs/archs/00-overview.md'),
  'utf8',
);
function documentedTypes(union: 'ClientMsg' | 'ServerMsg'): string[] {
  const start = overview.indexOf(`type ${union} =`);
  // 联合类型以「}; 可选注释 换行」结束；成员内部的字段分隔也会出现「;换行」，不能用作结束标记
  const terminator = /\};[ \t]*(?:\/\/[^\n]*)?\n/g;
  terminator.lastIndex = start;
  const end = start === -1 ? -1 : (terminator.exec(overview)?.index ?? -1);
  if (start === -1 || end === -1) throw new Error(`00 §3.1 中找不到 ${union}`);
  return [...overview.slice(start, end + 1).matchAll(/\{\s*t: '([^']+)'/g)].map(
    (m) => m[1] as string,
  );
}

const clientSamples: Record<string, unknown> = {
  hello: {
    t: 'hello',
    accessToken: 'tok',
    protocol: 1,
    ts: 1764144000000,
    nonce: 'n1',
    sig: 'sig',
  },
  subscribe: { t: 'subscribe', jobId: 'j1' },
  resume: { t: 'resume', jobId: 'j1', lastSeq: 7 },
  progress: { t: 'progress', jobId: 'j1', unitId: 'c_1', offsetMs: 1200 },
  seek: { t: 'seek', jobId: 'j1', unitId: 'c_5' },
  extend: { t: 'extend', jobId: 'j1' },
  cancel: { t: 'cancel', jobId: 'j1' },
  ping: { t: 'ping' },
};

const ev = { jobId: 'j1', seq: 3 };
const serverSamples: Record<string, unknown> = {
  'job.accepted': { t: 'job.accepted', ...ev, branch: 'same_lang', expectedUnits: 12 },
  'chapter.map': {
    t: 'chapter.map',
    ...ev,
    chapters: [
      {
        chapterId: 'ch1',
        title: '开场',
        firstUnitId: 'post',
        unitIds: ['post', 'c_1'],
        estDurationMs: 30000,
      },
    ],
  },
  'script.unit': {
    t: 'script.unit',
    ...ev,
    unitId: 'c_1',
    chapterId: 'ch1',
    role: 'commenter',
    voiceSlot: 2,
    emotion: 'NEUTRAL',
    lang: 'zh-CN',
    textSha256: HASH,
    pauseBeforeMs: 350,
  },
  'segment.ready': {
    t: 'segment.ready',
    ...ev,
    unitId: 'c_1',
    url: 'https://seg.example.com/seg/abc.m4a?sig=x',
    expiresAt: '2026-11-26T08:10:00Z',
    audioSha256: HASH,
    durationMs: 4200,
    bytes: 52000,
    scope: 'PUBLIC',
  },
  'quota.update': { t: 'quota.update', ...ev, remainingMc: -500 },
  'quota.exhausted': { t: 'quota.exhausted', ...ev, lastSegmentSeq: 2 },
  'job.degraded': { t: 'job.degraded', ...ev, reason: 'moderation', unitId: 'c_3' },
  'seek.ack': { t: 'seek.ack', ...ev, unitId: 'c_5', cached: false },
  'job.capped': { t: 'job.capped', ...ev, usedMc: 30000, capMc: 30000, atChapterId: 'ch3' },
  'job.truncated': { t: 'job.truncated', ...ev, keptChars: 60000 },
  'job.completed': { t: 'job.completed', ...ev, totalDurationMs: 600000 },
  'job.failed': { t: 'job.failed', ...ev, code: 'UPSTREAM_DEGRADED' },
  reconnect: { t: 'reconnect', afterMs: 1500 },
  pong: { t: 'pong' },
};

describe('消息类型与 00 §3.1 一致（文档即来源）', () => {
  it('上行', () => {
    expect(ClientMsg.options.map((o) => o.shape.t.value)).toEqual(documentedTypes('ClientMsg'));
    expect(Object.keys(clientSamples)).toEqual(documentedTypes('ClientMsg'));
  });
  it('下行', () => {
    expect(ServerMsg.options.map((o) => o.shape.t.value)).toEqual(documentedTypes('ServerMsg'));
    expect(Object.keys(serverSamples)).toEqual(documentedTypes('ServerMsg'));
  });
});

describe('每种消息的合法样例都能解析', () => {
  it.each(Object.entries(clientSamples))('上行 %s', (_t, sample) => {
    expect(parseClientMsg(sample).kind).toBe('message');
  });
  it.each(Object.entries(serverSamples))('下行 %s', (_t, sample) => {
    expect(parseServerMsg(sample).kind).toBe('message');
  });
});

describe('兼容规则', () => {
  it('客户端遇到未知 t：忽略而不是报错', () => {
    expect(parseServerMsg({ t: 'job.future_event', jobId: 'j1', seq: 9, anything: true })).toEqual({
      kind: 'ignored',
      t: 'job.future_event',
    });
  });

  it('服务端遇到未知上行 t：同样忽略（新客户端连到旧服务端）', () => {
    expect(parseClientMsg({ t: 'like', jobId: 'j1' }).kind).toBe('ignored');
  });

  it('已知 t 上多出的字段被丢弃（只增可选字段）', () => {
    const result = parseServerMsg({ ...(serverSamples['seek.ack'] as object), futureField: 'x' });
    expect(result.kind).toBe('message');
    expect(result.kind === 'message' && 'futureField' in result.message).toBe(false);
  });

  it('未知的降级原因不报错', () => {
    expect(
      parseServerMsg({ t: 'job.degraded', ...ev, reason: 'new_reason_from_future' }).kind,
    ).toBe('message');
  });

  it('protocol 不是 1 的 hello 被拒绝（破坏性变更要提升 protocol）', () => {
    const result = parseClientMsg({ ...(clientSamples.hello as object), protocol: 2 });
    expect(result.kind).toBe('invalid');
  });

  it.each([
    ['缺少 t', { jobId: 'j1' }],
    ['t 不是字符串', { t: 42 }],
    ['不是对象', 'pong'],
  ])('无法识别的输入：%s', (_name, data) => {
    expect(parseServerMsg(data).kind).toBe('invalid');
  });
});

describe('已知消息的字段校验', () => {
  const invalidPath = (data: unknown) => {
    const result = parseServerMsg(data);
    return result.kind === 'invalid' ? result.issues.map((i) => i.path.join('.')) : [];
  };

  it.each([
    [
      '停顿不在 0/200/350/550 中',
      { ...(serverSamples['script.unit'] as object), pauseBeforeMs: 100 },
      'pauseBeforeMs',
    ],
    ['切片 URL 无效', { ...(serverSamples['segment.ready'] as object), url: 'not-a-url' }, 'url'],
    [
      'expiresAt 不是 UTC',
      { ...(serverSamples['segment.ready'] as object), expiresAt: '2026-11-26 08:10' },
      'expiresAt',
    ],
    [
      '摘要不是 64 位小写十六进制',
      { ...(serverSamples['segment.ready'] as object), audioSha256: 'ABC' },
      'audioSha256',
    ],
    [
      '余额不是整数毫点',
      { ...(serverSamples['quota.update'] as object), remainingMc: 1.5 },
      'remainingMc',
    ],
    [
      'job.failed 的错误码未知',
      { ...(serverSamples['job.failed'] as object), code: 'OOPS' },
      'code',
    ],
    [
      'seq 为负数',
      {
        ...(serverSamples.pong as object),
        t: 'job.completed',
        jobId: 'j1',
        seq: -1,
        totalDurationMs: 1,
      },
      'seq',
    ],
  ])('拒绝：%s', (_name, data, path) => {
    expect(invalidPath(data)).toContain(path);
  });

  it('章节的 firstUnitId 必须是 unitIds 的第一项', () => {
    const chapters = [
      {
        chapterId: 'ch1',
        title: 'x',
        firstUnitId: 'c_1',
        unitIds: ['post', 'c_1'],
        estDurationMs: 1,
      },
    ];
    expect(invalidPath({ t: 'chapter.map', ...ev, chapters })).toContain('chapters.0.firstUnitId');
  });
});

describe('seq 单调递增', () => {
  it.each([
    [undefined, 0, true],
    [3, 4, true],
    [3, 3, false],
    [3, 2, false],
  ])('lastSeq=%s，seq=%s → %s', (lastSeq, seq, expected) => {
    expect(isSeqAdvance(lastSeq, seq)).toBe(expected);
  });
});
