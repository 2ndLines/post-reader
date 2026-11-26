import { describe, expect, it } from 'vitest';
import { extractLinks, toRelativePath } from './links.ts';

describe('extractLinks', () => {
  it('抽取内联链接、图片与引用定义，并记录行号', () => {
    const md = [
      '见 [AGENTS](AGENTS.md) 与 [卡](./tasks/P0.md#上下文 "标题")。',
      '![图](img/a.png)',
      '[ref]: ../adr/0001.md',
      '[外部](https://example.com) [锚点](#本节) [邮件](mailto:a@b.c)',
    ].join('\n');
    expect(extractLinks(md)).toEqual([
      { line: 1, target: 'AGENTS.md' },
      { line: 1, target: './tasks/P0.md#上下文' },
      { line: 2, target: 'img/a.png' },
      { line: 3, target: '../adr/0001.md' },
      { line: 4, target: 'https://example.com' },
      { line: 4, target: '#本节' },
      { line: 4, target: 'mailto:a@b.c' },
    ]);
  });

  it('跳过围栏代码块与行内代码', () => {
    const md = [
      '```md',
      '[x](missing.md)',
      '```',
      '`[y](missing2.md)` 正文',
      '~~~',
      '[z](m.md)',
      '~~~',
    ].join('\n');
    expect(extractLinks(md)).toEqual([]);
  });

  it('围栏只被同种且不短于开头的标记关闭', () => {
    const md = ['````', '```', '[x](inside.md)', '````', '[ok](after.md)'].join('\n');
    expect(extractLinks(md)).toEqual([{ line: 5, target: 'after.md' }]);
  });

  it('支持尖括号包裹的目标', () => {
    expect(extractLinks('[x](<docs/a b.md>)')).toEqual([{ line: 1, target: 'docs/a b.md' }]);
  });
});

describe('toRelativePath', () => {
  it.each([
    ['AGENTS.md', 'AGENTS.md'],
    ['./tasks/P0.md#上下文', './tasks/P0.md'],
    ['../adr/0001.md?plain=1', '../adr/0001.md'],
    ['docs/%E6%8A%80%E6%9C%AF.md', 'docs/技术.md'],
    ['bad%E0%A4%A.md', 'bad%E0%A4%A.md'],
  ])('%s → %s', (target, expected) => {
    expect(toRelativePath(target)).toBe(expected);
  });

  it.each(['https://example.com', 'mailto:a@b.c', '//cdn.example.com/x', '#锚点'])(
    '不检查 %s',
    (target) => {
      expect(toRelativePath(target)).toBeNull();
    },
  );
});
