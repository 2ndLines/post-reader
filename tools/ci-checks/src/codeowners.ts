/**
 * CODEOWNERS 覆盖检查（任务卡 P0-REPO-03 AC3）：playbook §9.4 代码块中的每条受保护路径，
 * 以及任务卡追加的路径，都必须在 CODEOWNERS 中以「根目录锚定」的形式出现并指定负责人。
 * CODEOWNERS 不支持 `{a,b}`，§9.4 中的花括号在比对前展开。
 */

/** 展开 `a/{x,y}/b{1,2}` 形式的花括号（不支持嵌套，§9.4 中也没有嵌套） */
export function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]*)\}/.exec(pattern);
  if (!match) return [pattern];
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + match[0].length);
  return (match[1] ?? '')
    .split(',')
    .flatMap((option) => expandBraces(`${before}${option}${after}`));
}

/** 取出 `### 9.4` 标题之后的第一个代码块，按空白拆分为路径 */
export function extractProtectedPaths(playbook: string): string[] {
  const heading = playbook.search(/^### 9\.4\b/m);
  if (heading === -1) throw new Error('playbook 中找不到「### 9.4」');
  const block = /```[^\n]*\n([\s\S]*?)```/.exec(playbook.slice(heading));
  if (!block?.[1]) throw new Error('playbook §9.4 之后找不到代码块');
  return block[1].split(/\s+/).filter(Boolean).flatMap(expandBraces);
}

export interface CodeownersRule {
  pattern: string;
  owners: string[];
}

export function parseCodeowners(content: string): CodeownersRule[] {
  return content
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [pattern = '', ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });
}

export interface CoverageProblem {
  path: string;
  reason: string;
}

export function checkCoverage(required: string[], rules: CodeownersRule[]): CoverageProblem[] {
  const problems: CoverageProblem[] = [];
  for (const path of [...new Set(required)]) {
    const anchored = `/${path.replace(/^\//, '')}`;
    // 最后一条匹配的规则生效（GitHub 语义），所以取最后一条同名规则
    const rule = rules.findLast((candidate) => candidate.pattern === anchored);
    if (!rule) problems.push({ path, reason: `CODEOWNERS 中没有 ${anchored}` });
    else if (rule.owners.length === 0)
      problems.push({ path, reason: `${anchored} 没有指定负责人` });
  }
  return problems;
}
