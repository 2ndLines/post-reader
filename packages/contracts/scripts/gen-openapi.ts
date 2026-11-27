/**
 * 生成 dist/openapi.yaml，并复制到 iOS APIClient（00 §2.2 `pnpm contracts:gen`）。
 * `--check`：只比较，不一致时退出码为 1（CI 用于校验生成物与源一致）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { stringify } from 'yaml';
import '../src/openapi-setup.ts';

// 必须在 openapi-setup 之后加载：zod 4 的 openapi() 只挂到补丁之后创建的 schema 上
const { buildOpenApiDocument } = await import('../src/openapi.ts');

const repoRoot = resolve(import.meta.dirname, '../../..');
const targets = [
  resolve(repoRoot, 'packages/contracts/dist/openapi.yaml'),
  resolve(repoRoot, 'apps/ios/Packages/APIClient/Sources/APIClient/openapi.yaml'),
];
const header = '# 由 packages/contracts 生成（pnpm contracts:gen），请勿手改\n';
const content =
  header + stringify(buildOpenApiDocument(), { lineWidth: 0, aliasDuplicateObjects: false });

const check = process.argv.includes('--check');
let stale = 0;
for (const target of targets) {
  const rel = relative(repoRoot, target);
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    current = '';
  }
  if (current === content) continue;
  stale += 1;
  if (check) {
    console.error(`过期：${rel}，请运行 pnpm contracts:gen`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    console.log(`已写入：${rel}`);
  }
}
console.log(
  check
    ? `openapi.yaml 一致性：${stale === 0 ? '通过' : `过期 ${stale} 个`}`
    : `openapi.yaml：更新 ${stale} 个`,
);
process.exitCode = check && stale > 0 ? 1 : 0;
