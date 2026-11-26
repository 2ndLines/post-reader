import { execFileSync } from 'node:child_process';
import { evaluateLicenses, type LicensePolicy, type LicenseReport } from '../licenses.ts';
import { readRepoFile, repoRoot } from './repo.ts';

const policy = JSON.parse(readRepoFile('tools/ci-checks/license-policy.json')) as LicensePolicy;
const output = execFileSync('pnpm', ['-r', 'licenses', 'list', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const report = JSON.parse(output) as LicenseReport;
const total = Object.values(report).reduce((count, packages) => count + packages.length, 0);
const { violations, notices } = evaluateLicenses(report, policy);

for (const notice of notices) {
  console.log(
    `提示  ${notice.name}@${notice.versions.join(',')}  ${notice.license}  ${notice.detail}`,
  );
}
for (const violation of violations) {
  console.error(
    `违规  ${violation.name}@${violation.versions.join(',')}  ${violation.license}  ${violation.detail}`,
  );
}
console.log(`许可证检查：共 ${total} 个包，违规 ${violations.length}，提示 ${notices.length}`);
process.exitCode = violations.length > 0 ? 1 : 0;
