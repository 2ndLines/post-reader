import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';

export const repoRoot = resolve(import.meta.dirname, '../../..');

export interface Result {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

/** 从 docker-compose.yml 读取某个服务的镜像引用，保证与本地容器同一 digest（05 §3.2） */
export function composeImage(service: string): string {
  const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');
  const block = new RegExp(`^ {2}${service}:\\n(?: {4}.*\\n|\\s*\\n)*? {4}image: (\\S+)`, 'm').exec(
    compose,
  );
  const image = block?.[1];
  if (!image?.includes('@sha256:')) {
    throw new Error(`docker-compose.yml 中 ${service} 没有按 digest 固定的镜像`);
  }
  return image;
}

export function run(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message: string };
    const tail = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n');
    throw new Error(`${command} ${args.join(' ')} 失败：${tail || e.message}`);
  }
}

/** 用最小的 RESP 报文发送 PING，避免为一次探测引入 Redis 客户端依赖 */
export function redisPing(host: string, port: number): Promise<string> {
  return new Promise((resolvePing, reject) => {
    const socket = createConnection({ host, port }, () => socket.write('*1\r\n$4\r\nPING\r\n'));
    socket.setTimeout(5000, () => socket.destroy(new Error('PING 超时')));
    socket.once('data', (data) => {
      socket.end();
      resolvePing(data.toString().trim());
    });
    socket.once('error', reject);
  });
}

export function summarize(title: string, results: Result[], _root: string): boolean {
  for (const r of results) {
    console.log(
      `${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(16)} ${(r.ms / 1000).toFixed(1).padStart(5)} s  ${r.detail}`,
    );
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${title}：${results.length - failed}/${results.length} 通过`);
  return failed === 0;
}
