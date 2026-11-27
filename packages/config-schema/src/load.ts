import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { z } from 'zod';
import { CONFIG_FILES } from './schemas.ts';

export type ConfigFileName = keyof typeof CONFIG_FILES;

/** 读取并校验一个配置文件；YAML 语法错误与 schema 不符都抛出带文件名的错误 */
export function loadConfigFile<N extends ConfigFileName>(
  configDir: string,
  name: N,
): z.infer<(typeof CONFIG_FILES)[N]> {
  const text = readFileSync(join(configDir, name), 'utf8');
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    throw new Error(`config/${name} 不是合法的 YAML：${(error as Error).message}`);
  }
  const result = CONFIG_FILES[name].safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(根)'}：${i.message}`)
      .join('；');
    throw new Error(`config/${name} 校验失败：${issues}`);
  }
  return result.data as z.infer<(typeof CONFIG_FILES)[N]>;
}
