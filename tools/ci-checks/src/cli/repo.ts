import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 仓库根目录：本文件位于 tools/ci-checks/src/cli/ */
export const repoRoot = resolve(import.meta.dirname, '../../../..');

export function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

export function readWorkflows(): { file: string; content: string }[] {
  const dir = '.github/workflows';
  return readdirSync(join(repoRoot, dir))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map((name) => ({ file: `${dir}/${name}`, content: readRepoFile(`${dir}/${name}`) }));
}
