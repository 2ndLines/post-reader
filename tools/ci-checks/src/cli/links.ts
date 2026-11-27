import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { extractLinks, toRelativePath } from '../links.ts';
import { repoRoot } from './repo.ts';

/** 检查范围：docs/ 全部 Markdown、各级 AGENTS.md 与 README.md（不进入 node_modules 等目录） */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'coverage',
  'dist',
  '.remember',
  '.build',
  '.swiftpm',
  // 构建前取得的第三方源码（apps/ios/Vendor/GRDB，不入库）
  'Vendor',
]);

function collect(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    // 不跟随符号链接（第三方源码中有指向自身的链接）
    if (lstatSync(full).isDirectory()) collect(full, out);
    else if (name.endsWith('.md')) {
      const rel = relative(repoRoot, full);
      if (rel.startsWith('docs/') || name === 'AGENTS.md' || name === 'README.md') out.push(full);
    }
  }
  return out;
}

const files = collect(repoRoot, []).sort();
let checked = 0;
const broken: string[] = [];
for (const file of files) {
  for (const { line, target } of extractLinks(readFileSync(file, 'utf8'))) {
    const path = toRelativePath(target);
    if (path === null) continue;
    checked += 1;
    const resolved = path.startsWith('/') ? join(repoRoot, path) : resolve(dirname(file), path);
    if (!existsSync(resolved)) broken.push(`${relative(repoRoot, file)}:${line}  ${target}`);
  }
}
for (const entry of broken) console.error(`失效  ${entry}`);
console.log(`链接检查：${files.length} 个文件，${checked} 个相对链接，失效 ${broken.length}`);
process.exitCode = broken.length > 0 ? 1 : 0;
