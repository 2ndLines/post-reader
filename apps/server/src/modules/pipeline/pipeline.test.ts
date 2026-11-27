import { describe, expect, it } from 'vitest';
import { fallbackSelect, type SelectContext, validateSelect } from './select.ts';
import { escapeSsml, normalizeForTts, prepareTtsSegments, splitSentences } from './tts-text.ts';
import { adjacentSameVoiceRate, assignVoices, HOST, type VoiceLine } from './voices.ts';

const PALETTE = [10, 11, 12, 13, 14, 15];

describe('assignVoices（02 §7.4，门禁 12.6）', () => {
  it('主持人与原帖作者固定；同一作者全帖不变；anon:* 互不相同', () => {
    const lines: VoiceLine[] = [
      { unitId: 'open', speaker: HOST },
      { unitId: 'post', speaker: 'op' },
      { unitId: 'c1', speaker: 'alice', replyToUnitId: 'post' },
      { unitId: 'c2', speaker: 'anon:c2', replyToUnitId: 'c1' },
      { unitId: 'c3', speaker: 'anon:c3', replyToUnitId: 'c2' },
      { unitId: 'c4', speaker: 'alice', replyToUnitId: 'c3' },
      { unitId: 'c5', speaker: 'op', replyToUnitId: 'c4' },
    ];
    const v = assignVoices(lines, PALETTE, 'op');
    expect(v.get('open')).toBe(10);
    expect(v.get('post')).toBe(11);
    expect(v.get('c5')).toBe(11);
    expect(v.get('c1')).toBe(v.get('c4'));
    expect(v.get('c2')).not.toBe(v.get('c3'));
    expect(adjacentSameVoiceRate(lines, v)).toBe(0);
  });

  it('首次出场之后的相邻也不同色（整篇检查冲突，而不只看首次出场）', () => {
    // a、b 先出场并拿到 12、13；c 首次出场时只与 b 相邻，若只看首次出场会拿到 12，之后与 a 相邻就同色
    const lines: VoiceLine[] = [
      { unitId: '1', speaker: 'a' },
      { unitId: '2', speaker: 'b' },
      { unitId: '3', speaker: 'c' },
      { unitId: '4', speaker: 'a' },
    ];
    const v = assignVoices(lines, [10, 11, 12, 13, 14], 'op');
    expect(adjacentSameVoiceRate(lines, v)).toBe(0);
  });

  it('随机脚本：冲突的作者数少于评论者槽位数时，相邻同色恒为 0；回复关系也不同色', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let run = 0; run < 300; run++) {
      const authors = ['op', ...Array.from({ length: 2 + rand(4) }, (_, i) => `u${i}`)];
      const lines: VoiceLine[] = [
        { unitId: 'open', speaker: HOST },
        { unitId: 'post', speaker: 'op' },
      ];
      for (let i = 0; i < 6 + rand(10); i++) {
        lines.push({
          unitId: `c${i}`,
          speaker: authors[rand(authors.length)] as string,
          replyToUnitId: (lines[rand(lines.length)] as VoiceLine).unitId,
        });
      }
      // 评论者槽位数 = 作者数，比任何一位评论者可能冲突的其他评论者数都多，所以总能找到空闲槽位
      const palette = [10, 11, ...Array.from({ length: authors.length }, (_, i) => 20 + i)];
      const v = assignVoices(lines, palette, 'op');
      expect(adjacentSameVoiceRate(lines, v)).toBe(0);
      for (const line of lines) {
        const target = lines.find((l) => l.unitId === line.replyToUnitId);
        if (target && target.speaker !== line.speaker)
          expect(v.get(line.unitId)).not.toBe(v.get(target.unitId));
      }
    }
  });

  it('槽位不够时仍给出结果（复用冲突最少的槽位），门禁统计会报出相邻同色', () => {
    const lines: VoiceLine[] = ['a', 'b', 'c', 'a', 'c', 'b'].map((s, i) => ({
      unitId: String(i),
      speaker: s,
    }));
    const v = assignVoices(lines, [10, 11, 12, 13], 'op');
    expect(v.size).toBe(6);
    expect(adjacentSameVoiceRate(lines, v)).toBeGreaterThan(0);
    expect(() => assignVoices(lines, [10, 11], 'op')).toThrow();
  });
});

describe('TTS 输入规范化（02 §7.2）', () => {
  it('移除零宽字符；超过 3 个的重复字符折叠为 3 个；转义 < > &', () => {
    expect(normalizeForTts('好​‍的！！！！！！哈哈哈哈哈')).toBe('好的！！！哈哈哈');
    expect(normalizeForTts('啊啊啊')).toBe('啊啊啊');
    expect(escapeSsml('a<b>&c')).toBe('a&lt;b&gt;&amp;c');
    expect(prepareTtsSegments('<speak>x</speak>', 'en-US')).toEqual([
      '&lt;speak&gt;x&lt;/speak&gt;',
    ]);
  });

  it('按句切分；超过 200 字符的句子在标点或空白处切开，都没有时硬切；按码点计', () => {
    expect(splitSentences('第一句。第二句！Third one? ', 'zh-CN')).toEqual([
      '第一句。',
      '第二句！',
      'Third one?',
    ]);
    const long = `${'字'.repeat(150)}，${'字'.repeat(150)}`;
    const parts = splitSentences(long, 'zh-CN');
    expect(parts).toHaveLength(2);
    expect(parts[0]?.endsWith('，')).toBe(true);
    const emoji = '😀'.repeat(450);
    const hard = splitSentences(emoji, 'en-US');
    expect(hard.map((p) => [...p].length)).toEqual([200, 200, 50]);
  });
});

describe('select 校验与降级（02 §7.3）', () => {
  const ctx = (over: Partial<SelectContext> = {}): SelectContext => ({
    commentIds: new Set(['c1', 'c2', 'c3', 'c4']),
    density: 'standard',
    counts: { brief: 1, min: 2, max: 3, deep: 4 },
    templateIds: new Set(['t.open', 't.turn']),
    entityIds: new Set(['e1']),
    ...over,
  });
  const ok = {
    order: ['c2', 'c1'],
    emotions: { c2: 'EMPHATIC', c1: 'NEUTRAL' },
    topics: [{ title: '', unitIds: ['c1'] }],
    transitions: [{ afterUnitId: null, templateId: 't.open', slots: { topic: 'e1' } }],
  };

  it('合法输出通过', () => {
    expect(validateSelect(ok, ctx())).toEqual([]);
  });

  it('逐条规则拒绝：重复、不存在的 ID、条数越界、情绪缺失、模板不存在、槽位不是实体、议题标题非空', () => {
    expect(validateSelect({ ...ok, order: ['c1', 'c1'] }, ctx())).toContain('order:duplicate');
    expect(
      validateSelect(
        { ...ok, order: ['c1', 'post'], emotions: { c1: 'NEUTRAL', post: 'NEUTRAL' } },
        ctx(),
      ),
    ).toContain('order:unknown:post');
    expect(
      validateSelect({ ...ok, order: ['c1'], emotions: { c1: 'NEUTRAL' }, topics: [] }, ctx()),
    ).toContain('order:count:1');
    expect(validateSelect({ ...ok, emotions: { c2: 'EMPHATIC' } }, ctx())).toContain(
      'emotions:missing:c1',
    );
    expect(
      validateSelect(
        { ...ok, transitions: [{ afterUnitId: 'c1', templateId: 't.free', slots: {} }] },
        ctx(),
      ),
    ).toContain('transitions:template:t.free');
    expect(
      validateSelect(
        {
          ...ok,
          transitions: [{ afterUnitId: null, templateId: 't.open', slots: { x: '自由文本' } }],
        },
        ctx(),
      ),
    ).toContain('transitions:slot:自由文本');
    expect(
      validateSelect({ ...ok, topics: [{ title: '模型起的标题', unitIds: [] }] }, ctx())[0],
    ).toMatch(/^schema:topics/);
    expect(
      validateSelect({ ...ok, emotions: { c2: 'ANGRY_SHOUTING', c1: 'NEUTRAL' } }, ctx())[0],
    ).toMatch(/^schema:emotions/);
  });

  it('各密度的条数：brief ≤ N_brief、deep ≤ N_deep；评论少于 N_min 时全部入选也合格', () => {
    expect(
      validateSelect(
        { ...ok, order: ['c1'], emotions: { c1: 'NEUTRAL' }, topics: [] },
        ctx({ density: 'brief' }),
      ),
    ).toEqual([]);
    expect(validateSelect(ok, ctx({ density: 'brief' }))).toContain('order:count:2');
    expect(
      validateSelect(
        { ...ok, order: ['c1'], emotions: { c1: 'NEUTRAL' }, topics: [] },
        ctx({ commentIds: new Set(['c1']) }),
      ),
    ).toEqual([]);
  });

  it('降级：按点赞数降序、同数保持原顺序，取密度上限条数；情绪 NEUTRAL；无串场', () => {
    const comments = [
      { unitId: 'c1', likes: 3 },
      { unitId: 'c2' },
      { unitId: 'c3', likes: 9 },
      { unitId: 'c4', likes: 3 },
    ];
    expect(fallbackSelect(comments, 'standard', ctx().counts)).toEqual({
      order: ['c3', 'c1', 'c4'],
      emotions: { c3: 'NEUTRAL', c1: 'NEUTRAL', c4: 'NEUTRAL' },
      topics: [],
      transitions: [],
    });
    expect(fallbackSelect(comments, 'brief', ctx().counts).order).toEqual(['c3']);
    expect(
      validateSelect(fallbackSelect(comments, 'deep', ctx().counts), ctx({ density: 'deep' })),
    ).toEqual([]);
  });
});
