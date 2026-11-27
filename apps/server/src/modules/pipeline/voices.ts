/**
 * 音色分配（02 §7.4；主 PRD 8.2；门禁 12.6 adjacent_same_voice_rate == 0）。纯函数。
 * - 主持人 → palette[0]；原帖作者 → palette[1]；同一 authorId 全帖不变；anon:* 各自独立（authorId 本身已不同）。
 * - 其余作者按首次出场顺序贪心着色：避开与其「相邻发言」或「回复关系」的、已着色作者的槽位。
 *   约束在整篇脚本上检查，而不只看首次出场，所以槽位够用时相邻同色为 0（02 §7.4 只要求首次出场时检查，P3-PIPE-02 Q1）。
 * - 槽位不够时复用冲突最少的槽位（仍可能出现相邻同色，门禁会报出；每档位至少 4 个槽位）。
 */
export interface VoiceLine {
  unitId: string;
  /** 主持人（开场、串场）为 'host' */
  speaker: string;
  /** 所回复单元的 unitId（评论的 parentId） */
  replyToUnitId?: string;
}

export const HOST = 'host';

export function assignVoices(
  lines: readonly VoiceLine[],
  palette: readonly number[],
  opAuthorId: string,
): Map<string, number> {
  if (palette.length < 3) throw new Error('音色槽位至少 3 个：主持人、原帖作者与评论者');
  const [hostSlot, opSlot, ...commenterSlots] = palette as [number, number, ...number[]];
  const speakerOfUnit = new Map(lines.map((l) => [l.unitId, l.speaker]));

  // 冲突图：相邻发言的两位、回复与被回复的两位不能同色
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string | undefined, b: string | undefined) => {
    if (a === undefined || b === undefined || a === b) return;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!neighbors.has(x)) neighbors.set(x, new Set());
      neighbors.get(x)?.add(y);
    }
  };
  lines.forEach((line, i) => {
    link(line.speaker, lines[i - 1]?.speaker);
    if (line.replyToUnitId) link(line.speaker, speakerOfUnit.get(line.replyToUnitId));
  });

  const slotOf = new Map<string, number>([
    [HOST, hostSlot],
    [opAuthorId, opSlot],
  ]);
  for (const line of lines) {
    if (slotOf.has(line.speaker)) continue;
    const taken = [...(neighbors.get(line.speaker) ?? [])]
      .map((n) => slotOf.get(n))
      .filter((s): s is number => s !== undefined);
    const free = commenterSlots.find((s) => !taken.includes(s));
    const chosen =
      free ??
      // 槽位不够：选冲突最少的（同数时取靠前的，保证确定性）
      commenterSlots.reduce((best, s) =>
        taken.filter((x) => x === s).length < taken.filter((x) => x === best).length ? s : best,
      );
    slotOf.set(line.speaker, chosen);
  }
  return new Map(lines.map((l) => [l.unitId, slotOf.get(l.speaker) as number]));
}

/** 门禁 12.6 的统计口径：相邻两句发言人不同但音色相同的比例 */
export function adjacentSameVoiceRate(
  lines: readonly VoiceLine[],
  voices: ReadonlyMap<string, number>,
): number {
  let pairs = 0;
  let same = 0;
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1] as VoiceLine;
    const b = lines[i] as VoiceLine;
    if (a.speaker === b.speaker) continue;
    pairs += 1;
    if (voices.get(a.unitId) === voices.get(b.unitId)) same += 1;
  }
  return pairs === 0 ? 0 : same / pairs;
}
