/**
 * CanonicalPost / Unit（00 §3.1；数据模型见《完整技术架构》§4.3；清洗与摘要规则见 packages/canonical-spec/SPEC.md）。
 *
 * 客户端上报的是清洗结果 `cleanText` 与其摘要 `hash`。服务端重算摘要时直接对 `cleanText` 计算，
 * **不得**对 `cleanText` 再清洗一次：清洗不是幂等的（SPEC.md §2 第 1 步、P1-SPEC-01 Q7）。
 */
import { z } from 'zod';
import { CacheScope, LangTag, Sha256Hex, UtcDateTime } from './common.ts';

/** 主帖的 unitId 固定为 "post" */
export const POST_UNIT_ID = 'post';

export const UnitKind = z.enum(['post', 'comment']);
export type UnitKind = z.infer<typeof UnitKind>;

/** low → 平铺播报（PRD 7.2） */
export const ParentConfidence = z.enum(['high', 'low']);
export type ParentConfidence = z.infer<typeof ParentConfidence>;

export const Unit = z.object({
  unitId: z.string().min(1),
  kind: UnitKind,
  /** 匿名或已注销：`anon:${unitId}` */
  authorId: z.string().min(1),
  authorDisplay: z.string().optional(),
  parentId: z.string().min(1).optional(),
  parentConfidence: ParentConfidence,
  /** 按 SPEC.md 清洗后的文本 */
  cleanText: z.string(),
  /** 只用于离线降级排序，不在 UI 展示（根 AGENTS.md：帖子卡片不显示任何计数） */
  likes: z.int().nonnegative().optional(),
  hasImages: z.boolean(),
  hasVideo: z.boolean(),
  /** H_i = SHA256(lp(unitId) ‖ lp(authorId) ‖ lp(cleanText))，小写 hex */
  hash: Sha256Hex,
});
export type Unit = z.infer<typeof Unit>;

export const PostSource = z.object({
  /** 站点适配器 ID */
  site: z.string().min(1),
  /** 规范化后的帖子 URL */
  url: z.url(),
  postId: z.string().min(1),
  fetchedAt: UtcDateTime,
  cacheScope: CacheScope,
});
export type PostSource = z.infer<typeof PostSource>;

export const CanonicalPost = z
  .object({
    schemaVersion: z.literal(1),
    source: PostSource,
    langHint: LangTag.optional(),
    /** units[0] 为主帖 */
    units: z.array(Unit).min(1),
  })
  .superRefine((post, ctx) => {
    const [first, ...rest] = post.units;
    if (first && (first.unitId !== POST_UNIT_ID || first.kind !== 'post')) {
      ctx.addIssue({
        code: 'custom',
        path: ['units', 0],
        message: 'units[0] 必须是主帖：unitId 为 "post"、kind 为 "post"',
      });
    }
    if (first?.parentId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['units', 0, 'parentId'],
        message: '主帖不能有 parentId',
      });
    }
    const ids = new Set<string>();
    post.units.forEach((unit, index) => {
      if (ids.has(unit.unitId)) {
        ctx.addIssue({ code: 'custom', path: ['units', index, 'unitId'], message: 'unitId 重复' });
      }
      ids.add(unit.unitId);
    });
    rest.forEach((unit, offset) => {
      const index = offset + 1;
      if (unit.kind !== 'comment') {
        ctx.addIssue({
          code: 'custom',
          path: ['units', index, 'kind'],
          message: '除 units[0] 外都必须是 comment',
        });
      }
      if (
        unit.parentId !== undefined &&
        (unit.parentId === unit.unitId || !ids.has(unit.parentId))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['units', index, 'parentId'],
          message: 'parentId 必须指向本帖中另一个已存在的单元',
        });
      }
    });
  });
export type CanonicalPost = z.infer<typeof CanonicalPost>;
