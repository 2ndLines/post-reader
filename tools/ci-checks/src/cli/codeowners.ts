import { checkCoverage, extractProtectedPaths, parseCodeowners } from '../codeowners.ts';
import { readRepoFile } from './repo.ts';

/** 任务卡 P0-REPO-03 在 §9.4 之外追加的路径 */
const ADDITIONAL = ['.claude/**', '.mcp.json', 'lefthook.yml', '.github/CODEOWNERS'];

const required = [
  ...extractProtectedPaths(readRepoFile('docs/archs/ai-dev-playbook.md')),
  ...ADDITIONAL,
];
const problems = checkCoverage(required, parseCodeowners(readRepoFile('.github/CODEOWNERS')));
for (const problem of problems) console.error(`${problem.path}  ${problem.reason}`);
console.log(`CODEOWNERS 覆盖检查：要求 ${required.length} 条，缺失 ${problems.length} 条`);
process.exitCode = problems.length > 0 ? 1 : 0;
