/** 测试用的合成帖子（内容是虚构的）：摘要按 canonical-spec 计算，可直接通过服务端重算。只给测试使用。 */
import { unitHash } from '@post-reader/canonical-spec';
import type { CreateJobRequest } from '@post-reader/contracts';
import type { z } from 'zod';

export async function syntheticJobRequest(
  overrides: Partial<z.infer<typeof CreateJobRequest>> = {},
  comments = 2,
): Promise<z.infer<typeof CreateJobRequest>> {
  const raw = [
    {
      unitId: 'post',
      kind: 'post' as const,
      authorId: 'op',
      cleanText: '合成主帖：今天试了一家新开的面馆。',
    },
    ...Array.from({ length: comments }, (_, i) => ({
      unitId: `c${i + 1}`,
      kind: 'comment' as const,
      authorId: `u${i + 1}`,
      parentId: 'post',
      cleanText: `合成评论 ${i + 1}`,
    })),
  ];
  const units = await Promise.all(
    raw.map(async (u) => ({
      ...u,
      parentConfidence: 'high' as const,
      hasImages: false,
      hasVideo: false,
      hash: await unitHash(u.unitId, u.authorId, u.cleanText),
    })),
  );
  return {
    post: {
      schemaVersion: 1,
      source: {
        site: 'example-forum',
        url: 'https://forum.example.com/t/1',
        postId: 't1',
        fetchedAt: '2026-11-26T00:00:00Z',
        cacheScope: 'PRIVATE',
      },
      units,
    },
    prefs: { density: 'standard', weights: [], style: 'solo_radio' },
    targetLang: 'zh-CN',
    readMode: 'translated',
    passthroughLangs: [],
    ...overrides,
  };
}
