/**
 * 工具版本一致性（05 §2.4）：`.mise.toml` 是唯一来源，`.nvmrc`、`packageManager`、`engines.node`
 * 与工作流里的 `GITLEAKS_VERSION` 必须与之相同。
 */

export interface ToolVersionInput {
  miseToml: string;
  nvmrc: string;
  packageJson: { packageManager?: string; engines?: { node?: string } };
  workflows: { file: string; content: string }[];
}

/** 只解析 `[tools]` 段中 `name = "version"` 形式的行，足以覆盖本仓库的写法 */
export function parseMiseTools(toml: string): Record<string, string> {
  const tools: Record<string, string> = {};
  let inTools = false;
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line.startsWith('[')) {
      inTools = line === '[tools]';
      continue;
    }
    if (!inTools || line === '') continue;
    const match = /^([\w-]+)\s*=\s*"([^"]+)"$/.exec(line);
    if (match?.[1] && match[2]) tools[match[1]] = match[2];
  }
  return tools;
}

export function checkToolVersions(input: ToolVersionInput): string[] {
  const errors: string[] = [];
  const tools = parseMiseTools(input.miseToml);
  const node = tools.node;
  const pnpm = tools.pnpm;
  const gitleaks = tools.gitleaks;

  if (!node) errors.push('.mise.toml 缺少 node 版本');
  if (!pnpm) errors.push('.mise.toml 缺少 pnpm 版本');
  if (!gitleaks) errors.push('.mise.toml 缺少 gitleaks 版本');

  if (node) {
    const nvmrc = input.nvmrc.trim();
    if (nvmrc !== node) errors.push(`.nvmrc（${nvmrc}）与 .mise.toml 的 node（${node}）不一致`);
    const major = Number.parseInt(node, 10);
    const expectedEngines = `>=${major} <${major + 1}`;
    const engines = input.packageJson.engines?.node;
    if (engines !== expectedEngines) {
      errors.push(
        `package.json engines.node 应为 "${expectedEngines}"，实际为 "${engines ?? '未设置'}"`,
      );
    }
  }

  if (pnpm) {
    const expected = `pnpm@${pnpm}`;
    const actual = input.packageJson.packageManager;
    if (actual !== expected) {
      errors.push(`package.json packageManager 应为 "${expected}"，实际为 "${actual ?? '未设置'}"`);
    }
  }

  if (gitleaks) {
    for (const workflow of input.workflows) {
      for (const match of workflow.content.matchAll(/GITLEAKS_VERSION:\s*["']?([\w.]+)["']?/g)) {
        if (match[1] !== gitleaks) {
          errors.push(
            `${workflow.file} 中 GITLEAKS_VERSION（${match[1]}）与 .mise.toml（${gitleaks}）不一致`,
          );
        }
      }
    }
  }

  return errors;
}
