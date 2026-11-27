/**
 * 校验 config/ 中已有 schema 的文件（pnpm check:config）。
 * 默认：校验结构并列出未标定的参数（不失败，开发与测试环境允许）；--production：存在未标定参数即失败。
 */
import { resolve } from 'node:path';
import {
  assertCalibrated,
  CONFIG_FILES,
  type ConfigFileName,
  listUncalibrated,
  loadConfigFile,
} from '../src/index.ts';

const configDir = resolve(import.meta.dirname, '../../../config');
const production = process.argv.includes('--production');
let failed = 0;
let pending = 0;
for (const name of Object.keys(CONFIG_FILES) as ConfigFileName[]) {
  try {
    const value = loadConfigFile(configDir, name);
    const missing = listUncalibrated(value);
    pending += missing.length;
    for (const m of missing) console.log(`未标定  config/${name}  ${m.path}  ← ${m.source}`);
    if (production) assertCalibrated(`config/${name}`, value);
    console.log(`通过    config/${name}`);
  } catch (error) {
    failed += 1;
    console.error(`失败    ${(error as Error).message}`);
  }
}
console.log(
  `配置校验：${Object.keys(CONFIG_FILES).length} 个文件，失败 ${failed}，未标定参数 ${pending}${production ? '（生产模式）' : ''}`,
);
process.exitCode = failed > 0 ? 1 : 0;
