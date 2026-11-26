/**
 * .claude/hooks/*.sh 的单元测试（任务卡 P0-REPO-04 AC5）：以 JSON 为 stdin 调用脚本，断言退出码与 stderr。
 * 用临时目录作为 CLAUDE_PROJECT_DIR，用假的 pnpm 隔离真实工具链。
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const hooksDir = resolve(import.meta.dirname, '../../../.claude/hooks');
let project: string;
let fakeBin: string;

/** 只含系统工具与假 pnpm 的 PATH：不经过 mise，避免调用真实工具链 */
function basePath(extra = ''): string {
  return [fakeBin, extra, '/usr/bin', '/bin'].filter(Boolean).join(':');
}

/**
 * 默认在 UTF-8 中文 locale 下运行：负责人本机即为 zh_CN.UTF-8。曾出现 `$rel。` 在该 locale 下被 bash
 * 当作变量名 `rel。`、在 set -u 下以退出码 1 结束（PreToolUse 视为非阻断，写入被放行）的缺陷，C locale 下测不出来。
 */
const UTF8_LOCALE = { LANG: 'zh_CN.UTF-8', LC_ALL: 'zh_CN.UTF-8' };

function runHook(
  script: string,
  input: unknown,
  env: Record<string, string> = {},
  scriptDir = hooksDir,
) {
  // 用绝对路径调用 bash：部分用例会把 PATH 缩到不含 bash 的目录
  const result = spawnSync('/bin/bash', [join(scriptDir, script)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { PATH: basePath(), CLAUDE_PROJECT_DIR: project, HOME: project, ...UTF8_LOCALE, ...env },
  });
  return { code: result.status, stderr: result.stderr };
}

function fakePnpm(exitCode: number, message = ''): string {
  const log = join(project, 'pnpm-calls.log');
  const script = `#!/bin/sh\necho "$@" >> "${log}"\n${message ? `echo "${message}"\n` : ''}exit ${exitCode}\n`;
  writeFileSync(join(fakeBin, 'pnpm'), script);
  chmodSync(join(fakeBin, 'pnpm'), 0o755);
  return log;
}

const edit = (filePath: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: filePath },
});

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'hooks-test-'));
  fakeBin = join(project, 'fakebin');
  mkdirSync(fakeBin);
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe('guard-paths.sh', () => {
  it.each([
    '.env',
    '.env.local',
    'apps/server/.env.production',
    'certs/apns.p8',
    'tls/server.pem',
    'keys/signing.key',
    'infra/intl/Pulumi.intl-prod.yaml',
    '.github/workflows/deploy-prod.yml',
    '.claude/settings.json',
    '.claude/hooks/guard-paths.sh',
    '.github/CODEOWNERS',
    'CODEOWNERS',
  ])('拒绝写入 %s', (rel) => {
    const { code, stderr } = runHook('guard-paths.sh', edit(join(project, rel)));
    expect(code).toBe(2);
    expect(stderr).toContain(rel);
  });

  it.each([
    'apps/server/src/main.ts',
    'env.example',
    '.claude/skills/start-task/SKILL.md',
    '.claude/settings.local.json',
    'infra/intl/Pulumi.intl-staging.yaml',
    '.github/workflows/ci.yml',
    'docs/archs/00-overview.md',
  ])('允许写入 %s', (rel) => {
    expect(runHook('guard-paths.sh', edit(join(project, rel))).code).toBe(0);
  });

  it('相对路径同样按规则判断', () => {
    expect(runHook('guard-paths.sh', edit('.env')).code).toBe(2);
    expect(runHook('guard-paths.sh', edit('./src/a.ts')).code).toBe(0);
  });

  it('含 .. 的路径一律拒绝，防止绕过', () => {
    // 用字符串拼接：path.join 会把 .. 规范化掉，测不到脚本本身
    const { code, stderr } = runHook('guard-paths.sh', edit(`${project}/apps/../src/a.ts`));
    expect(code).toBe(2);
    expect(stderr).toContain('..');
  });

  it('项目外的文件与没有 file_path 的工具不受影响', () => {
    expect(runHook('guard-paths.sh', edit('/elsewhere/.env')).code).toBe(0);
    expect(
      runHook('guard-paths.sh', { tool_name: 'Bash', tool_input: { command: 'ls' } }).code,
    ).toBe(0);
  });

  it('NotebookEdit 的 notebook_path 也受检查', () => {
    const input = {
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: join(project, '.claude/hooks/x.ipynb') },
    };
    expect(runHook('guard-paths.sh', input).code).toBe(2);
  });

  it.each([
    ['UTF-8', UTF8_LOCALE],
    ['C', { LANG: 'C', LC_ALL: 'C' }],
  ])('%s locale 下拒绝时退出码都是 2（变量名紧跟中文标点的回归测试）', (_name, locale) => {
    const { code, stderr } = runHook(
      'guard-paths.sh',
      edit(join(project, '.claude/hooks/x.sh')),
      locale,
    );
    expect(code).toBe(2);
    expect(stderr).not.toContain('unbound variable');
    expect(stderr).toContain('.claude/hooks/x.sh');
  });

  it('无法加载 lib.sh 时失败即关闭', () => {
    const lonely = join(project, 'lonely');
    mkdirSync(lonely);
    writeFileSync(join(lonely, 'guard-paths.sh'), readFileSync(join(hooksDir, 'guard-paths.sh')));
    const { code, stderr } = runHook('guard-paths.sh', edit(join(project, 'a.ts')), {}, lonely);
    expect(code).toBe(2);
    expect(stderr).toContain('lib.sh');
  });

  it('输入无法解析时失败即关闭', () => {
    expect(runHook('guard-paths.sh', '{not json').code).toBe(2);
  });

  it('缺少 jq 时失败即关闭', () => {
    const noJq = join(project, 'nojq');
    mkdirSync(noJq);
    for (const tool of ['dirname', 'cat']) {
      const source = ['/usr/bin', '/bin'].map((d) => join(d, tool)).find((p) => existsSync(p));
      if (source) symlinkSync(source, join(noJq, tool));
    }
    const { code, stderr } = runHook('guard-paths.sh', edit(join(project, 'a.ts')), { PATH: noJq });
    expect(code).toBe(2);
    expect(stderr).toContain('jq');
  });
});

describe('note-protected.sh', () => {
  beforeEach(() => {
    mkdirSync(join(project, '.github'));
    writeFileSync(
      join(project, '.github/CODEOWNERS'),
      '# 注释\n/infra/** @owner\n**/AGENTS.md @owner\n/apps/ios/App/*.entitlements @owner\n',
    );
  });
  const post = (rel: string) => ({
    hook_event_name: 'PostToolUse',
    tool_input: { file_path: join(project, rel) },
  });
  const touched = () => readFileSync(join(project, '.claude/state/protected-touched.txt'), 'utf8');

  it.each([
    'infra/intl/index.ts',
    'apps/server/AGENTS.md',
    'apps/ios/App/PostReader.entitlements',
    'config/tiers.yaml',
  ])('受保护路径 %s：记录并提醒', (rel) => {
    const { code, stderr } = runHook('note-protected.sh', post(rel));
    expect(code).toBe(2);
    expect(stderr).toContain('受保护路径');
    expect(touched()).toBe(`${rel}\n`);
  });

  it('同一路径只记录一次', () => {
    runHook('note-protected.sh', post('infra/a.ts'));
    runHook('note-protected.sh', post('infra/a.ts'));
    expect(touched()).toBe('infra/a.ts\n');
  });

  it('普通路径不记录、不提醒', () => {
    const { code, stderr } = runHook('note-protected.sh', post('apps/server/src/main.ts'));
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(existsSync(join(project, '.claude/state/protected-touched.txt'))).toBe(false);
  });
});

describe('format-changed.sh', () => {
  const post = (rel: string) => ({ tool_input: { file_path: join(project, rel) } });

  it('TS 文件调用 biome format --write', () => {
    writeFileSync(join(project, 'a.ts'), 'export const a=1\n');
    const log = fakePnpm(0);
    expect(runHook('format-changed.sh', post('a.ts')).code).toBe(0);
    expect(readFileSync(log, 'utf8')).toContain(
      'exec biome format --write --no-errors-on-unmatched a.ts',
    );
  });

  it('格式化失败时以退出码 2 反馈错误摘要', () => {
    writeFileSync(join(project, 'bad.ts'), 'export const =\n');
    fakePnpm(1, 'parse error: expected identifier');
    const { code, stderr } = runHook('format-changed.sh', post('bad.ts'));
    expect(code).toBe(2);
    expect(stderr).toContain('parse error');
  });

  it('非代码文件与不存在的文件不处理', () => {
    writeFileSync(join(project, 'notes.md'), '# x\n');
    const log = fakePnpm(0);
    expect(runHook('format-changed.sh', post('notes.md')).code).toBe(0);
    expect(runHook('format-changed.sh', post('missing.ts')).code).toBe(0);
    expect(existsSync(log)).toBe(false);
  });
});

describe('verify-on-stop.sh', () => {
  function gitRepo() {
    const git = (...args: string[]) => spawnSync('git', args, { cwd: project, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'hooks-test@example.invalid');
    git('config', 'user.name', 'hooks test');
    writeFileSync(join(project, 'README.md'), '# x\n');
    git('add', '.');
    git('commit', '-qm', 'init');
  }
  const stop = (active = false) => ({ hook_event_name: 'Stop', stop_hook_active: active });

  it('stop_hook_active 为 true 时直接放行，避免循环', () => {
    fakePnpm(1, 'should not run');
    expect(runHook('verify-on-stop.sh', stop(true)).code).toBe(0);
  });

  it('没有改动或只改了文档时不运行检查', () => {
    gitRepo();
    const log = fakePnpm(1);
    expect(runHook('verify-on-stop.sh', stop()).code).toBe(0);
    writeFileSync(join(project, 'docs.md'), 'x\n');
    expect(runHook('verify-on-stop.sh', stop()).code).toBe(0);
    expect(existsSync(log)).toBe(false);
  });

  it('TS 包有改动且检查通过时放行', () => {
    gitRepo();
    mkdirSync(join(project, 'packages/x'), { recursive: true });
    writeFileSync(join(project, 'packages/x/a.ts'), 'export {};\n');
    const log = fakePnpm(0);
    expect(runHook('verify-on-stop.sh', stop()).code).toBe(0);
    expect(readFileSync(log, 'utf8')).toContain('turbo run typecheck test --filter=...[HEAD]');
  });

  it('检查失败时以退出码 2 阻止结束，并给出摘要', () => {
    gitRepo();
    mkdirSync(join(project, 'tools/y'), { recursive: true });
    writeFileSync(join(project, 'tools/y/b.ts'), 'export {};\n');
    fakePnpm(1, 'error TS2322: Type string is not assignable');
    const { code, stderr } = runHook('verify-on-stop.sh', stop());
    expect(code).toBe(2);
    expect(stderr).toContain('TS2322');
    expect(existsSync(join(project, '.claude/state/verify-on-stop.log'))).toBe(true);
  });
});
