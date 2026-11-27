import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChangedPublishedMigrations } from '../migrations.ts';
import { repoRoot } from './repo.ts';

const DIR = 'apps/server/drizzle';
const base = process.env.MIGRATIONS_BASE_REF ?? 'origin/main';
const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

let publishedPaths: string[] = [];
try {
  publishedPaths = git('ls-tree', '-r', '--name-only', base, '--', DIR)
    .split('\n')
    .filter((p) => p.endsWith('.sql'));
} catch {
  console.log(`迁移不可变检查：找不到 ${base}，跳过（首次提交或浅克隆）`);
  process.exit(0);
}
const published = publishedPaths.map((path) => ({ path, content: git('show', `${base}:${path}`) }));
const current = new Map<string, string>();
if (existsSync(join(repoRoot, DIR))) {
  for (const name of readdirSync(join(repoRoot, DIR)).filter((n) => n.endsWith('.sql'))) {
    current.set(`${DIR}/${name}`, readFileSync(join(repoRoot, DIR, name), 'utf8'));
  }
}
const problems = findChangedPublishedMigrations(published, current);
for (const p of problems) console.error(`${p.path}  ${p.reason}`);
console.log(
  `迁移不可变检查：${base} 中已发布 ${published.length} 个，当前 ${current.size} 个，违规 ${problems.length}`,
);
process.exitCode = problems.length > 0 ? 1 : 0;
