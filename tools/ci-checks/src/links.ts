/**
 * Markdown 相对链接检查（任务卡 P0-REPO-02 AC1）：仓库内文档中的相对路径链接必须指向存在的文件或目录。
 * 只检查文件是否存在，不检查锚点；外部链接（含协议）、纯锚点、代码块与行内代码中的内容一律跳过。
 */

export interface LinkTarget {
  line: number;
  target: string;
}

/** 去掉围栏代码块与行内代码，保留行号 */
function stripCode(markdown: string): string[] {
  let fence: string | null = null;
  return markdown.split('\n').map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return '';
    }
    if (marker) {
      fence = marker;
      return '';
    }
    return line.replace(/(`+)[^`]*?\1/g, '');
  });
}

/** 抽取内联链接 `[x](target)`、图片 `![x](target)` 与引用定义 `[x]: target` 的目标 */
export function extractLinks(markdown: string): LinkTarget[] {
  const links: LinkTarget[] = [];
  stripCode(markdown).forEach((text, index) => {
    // 目标可写成 <带空格的路径>（CommonMark），否则到空白或右括号为止
    for (const match of text.matchAll(
      /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g,
    )) {
      const target = match[1] ?? match[2];
      if (target) links.push({ line: index + 1, target });
    }
    const definition = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$/.exec(text);
    if (definition?.[1]) links.push({ line: index + 1, target: definition[1] });
  });
  return links;
}

/** 返回需要检查的相对路径（已去掉锚点与查询串并解码）；不需要检查时返回 null */
export function toRelativePath(target: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  const path = target.replace(/[?#].*$/, '');
  if (path === '') return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
