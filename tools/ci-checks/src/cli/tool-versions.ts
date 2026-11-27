import { checkToolVersions } from '../tool-versions.ts';
import { readRepoFile, readWorkflows } from './repo.ts';

const errors = checkToolVersions({
  miseToml: readRepoFile('.mise.toml'),
  nvmrc: readRepoFile('.nvmrc'),
  packageJson: JSON.parse(readRepoFile('package.json')),
  workflows: readWorkflows(),
});
for (const error of errors) console.error(error);
console.log(`工具版本一致性：${errors.length === 0 ? '通过' : `不一致 ${errors.length} 处`}`);
process.exitCode = errors.length > 0 ? 1 : 0;
