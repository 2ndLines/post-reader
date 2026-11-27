/** 执行 drizzle/ 中的迁移（部署时先迁移再滚动发布，《完整技术架构》§11.4）；只在 migrator 角色下运行 */
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.ts';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../drizzle');

export async function runMigrations(url: string): Promise<void> {
  const { sql, db } = createDb({ url, maxConnections: 1, applicationName: 'post-reader-migrator' });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await sql.end();
  }
}
