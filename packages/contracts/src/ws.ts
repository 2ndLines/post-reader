/**
 * WebSocket 消息（00 §3.1「WebSocket 消息」，判别字段 `t`）。
 * 兼容规则：只增加可选字段或新消息类型；客户端遇到未知 `t` 必须忽略而不是报错；破坏性变更提升 `protocol`。
 * 下行消息带 `seq`，同一任务内单调递增（由 `isSeqAdvance` 判定是否为新消息）。
 */
import { z } from 'zod';
import { Branch, CacheScope, Emotion, LangTag, Sha256Hex, UtcDateTime } from './common.ts';
import { ErrorCode } from './errors.ts';

export const PROTOCOL_VERSION = 1;

const Id = z.string().min(1);
const NonNegativeInt = z.int().nonnegative();

/**
 * 降级原因。设计文档只给出 `moderation` 的字面值（02 §12），其余为默认命名（P1-CTR-03 Q1，待负责人确认）：
 * 备用 TTS、备用模型、译文校验失败被丢弃、选拔输出校验失败退化为按点赞排序。
 * 新原因属于「只增」：客户端对未知原因不报错，按通用降级提示处理。
 */
export const DegradeReason = z.enum([
  'moderation',
  'tts_backup',
  'llm_backup',
  'translation_dropped',
  'select_fallback',
]);
export type DegradeReason = z.infer<typeof DegradeReason>;

// ── 上行 ─────────────────────────────────────────────────────────────

export const ClientMsg = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    accessToken: z.string().min(1),
    protocol: z.literal(PROTOCOL_VERSION),
    ts: NonNegativeInt,
    nonce: z.string().min(1),
    sig: z.string().min(1),
  }),
  z.object({ t: z.literal('subscribe'), jobId: Id }),
  z.object({ t: z.literal('resume'), jobId: Id, lastSeq: NonNegativeInt }),
  /** 当前播放位置（位置语义，支持跳转） */
  z.object({ t: z.literal('progress'), jobId: Id, unitId: Id, offsetMs: NonNegativeInt }),
  /** 跳到某单元（章节起点或进度条吸附点），服务端移动合成窗口（02 §22.2） */
  z.object({ t: z.literal('seek'), jobId: Id, unitId: Id }),
  /** 单篇达到 P_post_max 后用户确认「继续生成」 */
  z.object({ t: z.literal('extend'), jobId: Id }),
  z.object({ t: z.literal('cancel'), jobId: Id }),
  z.object({ t: z.literal('ping') }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

// ── 下行 ─────────────────────────────────────────────────────────────

const jobEvent = { jobId: Id, seq: NonNegativeInt };

export const Chapter = z
  .object({
    chapterId: Id,
    title: z.string(),
    firstUnitId: Id,
    unitIds: z.array(Id).min(1),
    estDurationMs: NonNegativeInt,
  })
  .refine((c) => c.unitIds[0] === c.firstUnitId, {
    error: 'firstUnitId 必须是 unitIds 的第一项',
    path: ['firstUnitId'],
  });
export type Chapter = z.infer<typeof Chapter>;

export const ServerMsg = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('job.accepted'),
    ...jobEvent,
    branch: Branch,
    expectedUnits: NonNegativeInt,
  }),
  /** 编排完成后立即下发，作为进度条与跳章的依据 */
  z.object({ t: z.literal('chapter.map'), ...jobEvent, chapters: z.array(Chapter) }),
  z.object({
    t: z.literal('script.unit'),
    ...jobEvent,
    unitId: Id,
    chapterId: Id,
    role: z.enum(['host', 'op', 'commenter']),
    voiceSlot: NonNegativeInt,
    emotion: Emotion,
    lang: LangTag,
    textSha256: Sha256Hex,
    translatedText: z.string().optional(),
    pauseBeforeMs: z.union([z.literal(0), z.literal(200), z.literal(350), z.literal(550)]),
  }),
  z.object({
    t: z.literal('segment.ready'),
    ...jobEvent,
    unitId: Id,
    url: z.url(),
    expiresAt: UtcDateTime,
    audioSha256: Sha256Hex,
    durationMs: z.int().positive(),
    bytes: z.int().positive(),
    scope: CacheScope,
  }),
  /** 统一额度池余额，单位为毫点（1 点 = 1000 毫点），可以为负 */
  z.object({ t: z.literal('quota.update'), ...jobEvent, remainingMc: z.int() }),
  z.object({ t: z.literal('quota.exhausted'), ...jobEvent, lastSegmentSeq: NonNegativeInt }),
  z.object({
    t: z.literal('job.degraded'),
    ...jobEvent,
    reason: z.union([DegradeReason, z.string().min(1)]),
    unitId: Id.optional(),
  }),
  /** cached = 目标单元的切片已就绪 */
  z.object({ t: z.literal('seek.ack'), ...jobEvent, unitId: Id, cached: z.boolean() }),
  /** 达到单篇上限，在章节边界停止 */
  z.object({
    t: z.literal('job.capped'),
    ...jobEvent,
    usedMc: NonNegativeInt,
    capMc: z.int().positive(),
    atChapterId: Id,
  }),
  /** 文本超过 L_post_max，已截取前部 */
  z.object({ t: z.literal('job.truncated'), ...jobEvent, keptChars: NonNegativeInt }),
  z.object({ t: z.literal('job.completed'), ...jobEvent, totalDurationMs: NonNegativeInt }),
  z.object({ t: z.literal('job.failed'), ...jobEvent, code: ErrorCode }),
  z.object({ t: z.literal('reconnect'), afterMs: NonNegativeInt }),
  z.object({ t: z.literal('pong') }),
]);
export type ServerMsg = z.infer<typeof ServerMsg>;

const SERVER_TYPES: ReadonlySet<string> = new Set(ServerMsg.options.map((o) => o.shape.t.value));
const CLIENT_TYPES: ReadonlySet<string> = new Set(ClientMsg.options.map((o) => o.shape.t.value));

export type ParseResult<T> =
  | { kind: 'message'; message: T }
  /** 未知 `t`：按兼容规则忽略，不是错误 */
  | { kind: 'ignored'; t: string }
  | { kind: 'invalid'; issues: z.core.$ZodIssue[] };

function parseWith<T>(
  schema: z.ZodType<T>,
  known: ReadonlySet<string>,
  data: unknown,
): ParseResult<T> {
  const t = typeof data === 'object' && data !== null ? (data as { t?: unknown }).t : undefined;
  if (typeof t === 'string' && !known.has(t)) return { kind: 'ignored', t };
  const result = schema.safeParse(data);
  return result.success
    ? { kind: 'message', message: result.data }
    : { kind: 'invalid', issues: result.error.issues };
}

/** 客户端解析下行消息：未知类型忽略，已知类型字段不合法时报告 */
export function parseServerMsg(data: unknown): ParseResult<ServerMsg> {
  return parseWith(ServerMsg, SERVER_TYPES, data);
}

/**
 * 服务端解析上行消息。未知类型归为 ignored，由网关决定处理方式：05 §4.2 规定 bff 遇到未知 `t` 关闭连接
 * （与客户端「忽略未知下行」的规则不同）。
 */
export function parseClientMsg(data: unknown): ParseResult<ClientMsg> {
  return parseWith(ClientMsg, CLIENT_TYPES, data);
}

/** 同一任务内 seq 单调递增：只有大于已处理的最大 seq 的消息才是新消息（重连或重放时用于去重） */
export function isSeqAdvance(lastSeq: number | undefined, seq: number): boolean {
  return lastSeq === undefined || seq > lastSeq;
}
