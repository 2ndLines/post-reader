/** /jobs*（02 §4.2、§7）。WebSocket 流的消息见 ../ws.ts */
import { z } from 'zod';
import { CanonicalPost } from '../canonical-post.ts';
import { LangTag } from '../common.ts';
import { Prefs } from '../prefs.ts';
import { DegradeReason } from '../ws.ts';

/** 单帖临时覆盖：朗读译文 / 朗读原文（主 PRD 5.2.3）；源语种为 Tier 3 时服务端忽略 original */
export const ReadMode = z.enum(['translated', 'original']);

export const CreateJobRequest = z.object({
  post: CanonicalPost,
  prefs: Prefs,
  targetLang: LangTag,
  readMode: ReadMode,
  passthroughLangs: z.array(LangTag),
});

export const CreateJobResponse = z.object({
  jobId: z.string().min(1),
  /** WebSocket 地址（wss://） */
  streamUrl: z.url({ protocol: /^wss?$/ }),
});

/** 任务状态机（02 §5）；degraded 是标记，不是状态 */
export const JobState = z.enum([
  'created',
  'admitted',
  'planning',
  'scripting',
  'synthesizing',
  'completed',
  'rejected',
  'failed',
  'cancelled',
  'quota_exhausted',
]);

export const JobStatus = z.object({
  jobId: z.string().min(1),
  state: JobState,
  degraded: z.array(z.union([DegradeReason, z.string().min(1)])),
  readySegments: z.int().nonnegative(),
});

export const AckRequest = z.object({ playedThroughSeq: z.int().nonnegative() });
