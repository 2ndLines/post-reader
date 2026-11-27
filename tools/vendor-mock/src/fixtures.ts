/**
 * 回放用的样本（fixture）：按请求指纹匹配录制好的响应。
 * 样本中不保存请求头与请求体原文（只存请求体的 SHA-256），避免把密钥或测试数据之外的内容写进仓库。
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface Fixture {
  name: string;
  vendor: string;
  request: {
    method: string;
    path: string;
    /** 省略时匹配任意请求体 */
    bodySha256?: string;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    /** JSON 响应体 */
    body?: unknown;
    /** 二进制响应体（例如音频） */
    bodyBase64?: string;
    /** 流式响应：按顺序写出，每块写出前等待 delayMs（模拟 SSE、音频流与首包时延） */
    chunks?: { delayMs: number; data: string }[];
  };
  /** 写出响应头之前的等待（首字节时延） */
  latencyMs?: number;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function assertFixture(value: unknown, file: string): asserts value is Fixture {
  const f = value as Partial<Fixture>;
  const ok =
    typeof f?.name === 'string' &&
    typeof f.vendor === 'string' &&
    typeof f.request?.method === 'string' &&
    typeof f.request.path === 'string' &&
    typeof f.response?.status === 'number';
  if (!ok) throw new Error(`样本格式不正确：${file}`);
}

/** 递归读取目录下的 *.json 样本；任何一个格式不对都报错并给出文件名 */
export function loadFixtures(dir: string): Fixture[] {
  const out: Fixture[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(readFileSync(full, 'utf8'));
        } catch {
          throw new Error(`样本不是合法的 JSON：${relative(dir, full)}`);
        }
        assertFixture(parsed, relative(dir, full));
        out.push(parsed);
      }
    }
  };
  walk(dir);
  return out;
}

/** 先找请求体摘要完全一致的样本，再找不限请求体的样本 */
export function findFixture(
  fixtures: Fixture[],
  method: string,
  path: string,
  bodySha256: string,
): Fixture | undefined {
  const candidates = fixtures.filter(
    (f) => f.request.method.toUpperCase() === method.toUpperCase() && f.request.path === path,
  );
  return (
    candidates.find((f) => f.request.bodySha256 === bodySha256) ??
    candidates.find((f) => f.request.bodySha256 === undefined)
  );
}
