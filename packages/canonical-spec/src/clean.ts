/**
 * 清洗参考实现（SPEC.md §2，schemaVersion = 1）。
 * 按码位逐步处理，步骤与 SPEC.md 一一对应，便于与 Swift 实现（ReaderCore.Cleaner）逐步对照。
 */

export const SCHEMA_VERSION = 1;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const REPLACEMENT = 0xfffd;
const LF = 0x0a;
const ZWNJ = 0x200c;
const ZWJ = 0x200d;

/** 第 1 步：解码 HTML 实体（只解码一遍） */
function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));/g,
    (_match, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
      if (named !== undefined) return NAMED_ENTITIES[named] ?? _match;
      const codePoint =
        decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? '', 16);
      const valid =
        codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
      return String.fromCodePoint(valid ? codePoint : REPLACEMENT);
    },
  );
}

/** 第 3 步第 1 小步：CRLF、CR、NEL、LS、PS 统一为 LF */
function unifyNewlines(codePoints: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < codePoints.length; i += 1) {
    const cp = codePoints[i] as number;
    if (cp === 0x0d) {
      out.push(LF);
      if (codePoints[i + 1] === LF) i += 1;
    } else if (cp === 0x85 || cp === 0x2028 || cp === 0x2029) {
      out.push(LF);
    } else {
      out.push(cp);
    }
  }
  return out;
}

/** 第 3 步第 2 小步要删除的码位 */
function isDeletedControl(cp: number): boolean {
  return (
    cp <= 0x09 ||
    (cp >= 0x0b && cp <= 0x1f) ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0xfeff ||
    cp === 0x200b ||
    cp === 0x2060 ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069)
  );
}

const JOINING_RANGES: readonly (readonly [number, number])[] = [
  [0x0600, 0x06ff],
  [0x0700, 0x074f],
  [0x0750, 0x077f],
  [0x07c0, 0x07ff],
  [0x0860, 0x086f],
  [0x0870, 0x089f],
  [0x08a0, 0x08ff],
  [0x0900, 0x0d7f],
  [0x0d80, 0x0dff],
  [0x1800, 0x18af],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfefe],
];

function isJoiningScript(cp: number | undefined): boolean {
  return cp !== undefined && JOINING_RANGES.some(([start, end]) => cp >= start && cp <= end);
}

const EMOJI = /^\p{Emoji}$/u;

function isNonAsciiEmoji(cp: number | undefined): boolean {
  return cp !== undefined && cp >= 0x80 && EMOJI.test(String.fromCodePoint(cp));
}

/** 第 4 步：按第 3 步输出中的相邻码位判定每个 ZWNJ/ZWJ 是否保留，判定完成后统一删除 */
function filterJoiners(codePoints: number[]): number[] {
  const keep = codePoints.map((cp, i) => {
    if (cp !== ZWNJ && cp !== ZWJ) return true;
    const prev = codePoints[i - 1];
    const next = codePoints[i + 1];
    if (isJoiningScript(prev) && isJoiningScript(next)) return true;
    if (cp === ZWJ) {
      let j = i - 1;
      while (j >= 0 && (codePoints[j] === 0xfe0f || codePoints[j] === 0xfe0e)) j -= 1;
      return isNonAsciiEmoji(codePoints[j]) && isNonAsciiEmoji(next);
    }
    return false;
  });
  return codePoints.filter((_cp, i) => keep[i]);
}

const WHITESPACE = new Set([0x20, 0xa0, 0x1680, 0x202f, 0x205f, 0x3000]);
for (let cp = 0x2000; cp <= 0x200a; cp += 1) WHITESPACE.add(cp);

function isWhitespace(cp: number): boolean {
  return WHITESPACE.has(cp);
}

/** 第 5 步：只含空白的行变为空行；3 个及以上的 LF 折叠为 2 个；去除首尾空白与 LF */
function normalizeLines(codePoints: number[]): number[] {
  const lines: number[][] = [[]];
  for (const cp of codePoints) {
    if (cp === LF) lines.push([]);
    else (lines[lines.length - 1] as number[]).push(cp);
  }
  const joined: number[] = [];
  lines.forEach((line, index) => {
    if (index > 0) joined.push(LF);
    if (!line.every(isWhitespace)) joined.push(...line);
  });

  const collapsed: number[] = [];
  let run = 0;
  for (const cp of joined) {
    run = cp === LF ? run + 1 : 0;
    if (cp !== LF || run <= 2) collapsed.push(cp);
  }

  const isTrimmed = (cp: number) => cp === LF || isWhitespace(cp);
  let start = 0;
  let end = collapsed.length;
  while (start < end && isTrimmed(collapsed[start] as number)) start += 1;
  while (end > start && isTrimmed(collapsed[end - 1] as number)) end -= 1;
  return collapsed.slice(start, end);
}

/** 清洗（SPEC.md §2）。第 6 步：不做 SSML 转义 */
export function clean(raw: string): string {
  const decoded = decodeEntities(raw.toWellFormed());
  const normalized = decoded.normalize('NFC');
  const codePoints = Array.from(normalized, (char) => char.codePointAt(0) as number);
  const withoutControls = unifyNewlines(codePoints).filter((cp) => !isDeletedControl(cp));
  return fromCodePoints(normalizeLines(filterJoiners(withoutControls)));
}

/** 分块转换：避免超长文本时展开参数超出引擎上限（RangeError） */
function fromCodePoints(codePoints: number[]): string {
  const CHUNK = 8192;
  let out = '';
  for (let i = 0; i < codePoints.length; i += CHUNK) {
    out += String.fromCodePoint(...codePoints.slice(i, i + CHUNK));
  }
  return out;
}
