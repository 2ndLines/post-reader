/**
 * `select` 的结构化输出与校验（02 §7.3），以及校验两次失败后的降级（按点赞数排序 + 无串场）。纯函数。
 * 条数区间 N_brief、[N_min, N_max]、N_deep 是待标定参数（主 PRD §1 参数表），由调用方传入。
 */
import { type Density, Emotion, type Unit } from '@post-reader/contracts';
import { z } from 'zod';

export const SelectOutput = z.object({
  /** 入选评论的 unitId，不含主帖 */
  order: z.array(z.string()).min(1),
  emotions: z.record(z.string(), Emotion),
  /** title 强制为空串：议题名称不允许模型自由生成 */
  topics: z.array(z.object({ title: z.string().max(0), unitIds: z.array(z.string()) })).max(6),
  transitions: z.array(
    z.object({
      /** null = 开场之后 */
      afterUnitId: z.string().nullable(),
      templateId: z.string(),
      /** 槽位值必须是本帖抽取的实体 ID */
      slots: z.record(z.string(), z.string()),
    }),
  ),
});
export type SelectOutput = z.infer<typeof SelectOutput>;

export interface SelectCounts {
  brief: number;
  min: number;
  max: number;
  deep: number;
}

export interface SelectContext {
  /** 本帖全部评论的 unitId */
  commentIds: ReadonlySet<string>;
  density: Density;
  counts: SelectCounts;
  templateIds: ReadonlySet<string>;
  entityIds: ReadonlySet<string>;
}

/** 返回问题列表（只含 ID 与规则名，不含正文）；空数组表示通过 */
export function validateSelect(raw: unknown, ctx: SelectContext): string[] {
  const parsed = SelectOutput.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((i) => `schema:${i.path.join('.')}`);
  const out = parsed.data;
  const issues: string[] = [];
  const selected = new Set(out.order);
  if (selected.size !== out.order.length) issues.push('order:duplicate');
  for (const id of out.order) if (!ctx.commentIds.has(id)) issues.push(`order:unknown:${id}`);

  const n = out.order.length;
  const { brief, min, max, deep } = ctx.counts;
  const inRange =
    ctx.density === 'brief'
      ? n <= brief
      : ctx.density === 'standard'
        ? n >= min && n <= max
        : n <= deep;
  // 评论不足下限时，全部入选也算合格
  if (!inRange && !(ctx.density === 'standard' && n === ctx.commentIds.size && n < min))
    issues.push(`order:count:${n}`);

  for (const id of out.order) if (!(id in out.emotions)) issues.push(`emotions:missing:${id}`);
  for (const id of Object.keys(out.emotions))
    if (!selected.has(id)) issues.push(`emotions:unknown:${id}`);
  for (const topic of out.topics)
    for (const id of topic.unitIds) if (!selected.has(id)) issues.push(`topics:unknown:${id}`);
  for (const tr of out.transitions) {
    if (tr.afterUnitId !== null && !selected.has(tr.afterUnitId))
      issues.push(`transitions:after:${tr.afterUnitId}`);
    if (!ctx.templateIds.has(tr.templateId)) issues.push(`transitions:template:${tr.templateId}`);
    for (const value of Object.values(tr.slots))
      if (!ctx.entityIds.has(value)) issues.push(`transitions:slot:${value}`);
  }
  return issues;
}

/** 各密度的条数上限（降级时取上限） */
function densityLimit(density: Density, counts: SelectCounts): number {
  return density === 'brief' ? counts.brief : density === 'standard' ? counts.max : counts.deep;
}

/**
 * 降级（02 §7.3）：按点赞数降序（没有点赞数按 0，同数保持原顺序），取该密度的上限条数；情绪全为 NEUTRAL；无议题、无串场。
 */
export function fallbackSelect(
  comments: readonly Pick<Unit, 'unitId' | 'likes'>[],
  density: Density,
  counts: SelectCounts,
): SelectOutput {
  const order = comments
    .map((c, i) => ({ id: c.unitId, likes: c.likes ?? 0, i }))
    .sort((a, b) => b.likes - a.likes || a.i - b.i)
    .slice(0, densityLimit(density, counts))
    .map((c) => c.id);
  return {
    order,
    emotions: Object.fromEntries(order.map((id) => [id, 'NEUTRAL' as const])),
    topics: [],
    transitions: [],
  };
}
