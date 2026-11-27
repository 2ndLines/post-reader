/**
 * 集成测试用的临时数据库：在 TEST_DATABASE_URL 指向的真实 PostgreSQL 上建库、迁移，结束后删除。
 * Testcontainers 的依赖树带入 BlueOak 许可证的包，接受与否待负责人决定（ADR 0017 约束 6、P2-SRV-02 Q2），
 * 因此本地用 `pnpm dev` 的容器，CI 用 GitHub Actions 的 service 容器（与 docker-compose.yml 同一镜像 digest）。
 */
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://reader:reader-local-only@127.0.0.1:5432/reader';

export async function createTestDatabase() {
  const name = `test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  const handle = createDb({ url: url.toString(), maxConnections: 4 });
  return {
    ...handle,
    url: url.toString(),
    async drop() {
      await handle.sql.end();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
