/**
 * 启动：MODE=replay（默认）或 record；PORT 默认 4010（05 §3.2）；FIXTURES_DIR 默认 ./fixtures。
 * 录制：UPSTREAM_URL、RECORD_DIR，并设置 VENDOR_MOCK_RECORD_CONFIRM=yes（只在负责人授权的任务中，用预发密钥）。
 */
import { resolve } from 'node:path';
import { loadFixtures } from './fixtures.ts';
import { buildMockServer } from './server.ts';

const mode = process.env.MODE === 'record' ? 'record' : 'replay';
const fixturesDir = resolve(
  process.env.FIXTURES_DIR ?? resolve(import.meta.dirname, '../fixtures'),
);
const app = await buildMockServer({
  mode,
  fixtures: loadFixtures(fixturesDir),
  ...(process.env.UPSTREAM_URL ? { upstream: process.env.UPSTREAM_URL } : {}),
  ...(process.env.RECORD_DIR ? { recordDir: resolve(process.env.RECORD_DIR) } : {}),
  recordConfirmed: process.env.VENDOR_MOCK_RECORD_CONFIRM === 'yes',
  ...(process.env.VENDOR ? { vendor: process.env.VENDOR } : {}),
});
const address = await app.listen({ port: Number(process.env.PORT ?? 4010), host: '127.0.0.1' });
console.log(`vendor-mock ${mode} 模式，监听 ${address}`);
