import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entry = resolve(import.meta.dirname, 'main.ts');
const baseEnv = {
  PATH: process.env.PATH ?? '',
  ROLES: 'bff',
  REGION: 'intl',
  DATABASE_URL: 'postgres://reader:reader-local-only@127.0.0.1:5432/reader',
  REDIS_URL: 'redis://127.0.0.1:6379',
  LOG_LEVEL: 'info',
};

function start(env: Record<string, string>) {
  const child = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', (d) => (output += String(d)));
  child.stderr?.on('data', (d) => (output += String(d)));
  return { child, output: () => output };
}

async function waitFor(
  child: ChildProcess,
  output: () => string,
  pattern: RegExp,
  timeoutMs = 10_000,
) {
  const started = Date.now();
  while (!pattern.test(output())) {
    if (child.exitCode !== null) throw new Error(`进程已退出：${output()}`);
    if (Date.now() - started > timeoutMs) throw new Error(`等待超时：${output()}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('进程入口（02 §3.2）', () => {
  it('启动 → 健康检查 → SIGTERM 后优雅退出（退出码 0）', async () => {
    const { child, output } = start({ ...baseEnv, PORT: '0' });
    await waitFor(child, output, /"msg":"server started"/);
    const address = /"address":"([^"]+)"/.exec(output())?.[1] as string;
    const res = await fetch(`${address.replace('0.0.0.0', '127.0.0.1')}/v1/healthz`);
    expect(await res.json()).toEqual({ status: 'ok' });
    child.kill('SIGTERM');
    const [code] = await once(child, 'exit');
    expect(code).toBe(0);
  }, 20_000);

  it('环境变量不合法：退出码 1，只输出变量名不输出值', async () => {
    const { child, output } = start({ ...baseEnv, DATABASE_URL: 'bad-url-with-p4ssw0rd' });
    const [code] = await once(child, 'exit');
    expect(code).toBe(1);
    expect(output()).toContain('DATABASE_URL 不合法');
    expect(output()).not.toContain('p4ssw0rd');
  }, 20_000);
});
