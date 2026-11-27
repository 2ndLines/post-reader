/**
 * TTS 输入规范化（02 §7.2 applySafetyLayer；主 PRD 6.2.4）。纯函数。
 * 顺序：移除零宽字符 → 折叠超过 3 个的重复字符 → 按句切分（单句 ≤ 200 字符）→ 转义 SSML 保留字符 `< > &`。
 * 切分在转义之前做，所以 200 字符的上限按用户可见的字符计（码点）。
 */
const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const REPEATED = /(.)\1{3,}/gsu;
const MAX_SENTENCE_CHARS = 200;

export function normalizeForTts(text: string): string {
  return text.replace(ZERO_WIDTH, '').replace(REPEATED, '$1$1$1');
}

export function escapeSsml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** 超长的句子在上限内最后一个空白或标点之后切开；都没有时按上限硬切 */
function hardSplit(sentence: string, max: number): string[] {
  const out: string[] = [];
  let rest = [...sentence];
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = -1;
    for (let i = window.length - 1; i > 0; i--) {
      if (/[\s\p{P}]/u.test(window[i] as string)) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).join(''));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) out.push(rest.join(''));
  return out;
}

/** 按句切分（Intl.Segmenter，按语种），每段 ≤ max 个码点；去掉首尾空白与空段 */
export function splitSentences(text: string, lang: string, max = MAX_SENTENCE_CHARS): string[] {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
  return [...segmenter.segment(text)]
    .map((s) => s.segment.trim())
    .filter((s) => s.length > 0)
    .flatMap((s) => hardSplit(s, max))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 一个单元送入 TTS 的各段文本（已规范化、切分并转义） */
export function prepareTtsSegments(text: string, lang: string): string[] {
  return splitSentences(normalizeForTts(text), lang).map(escapeSsml);
}
