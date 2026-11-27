/**
 * PostgreSQL 连接（02 §11、05 §4.2：每角色一个连接池，池大小写进配置；语句超时在连接参数中设置）。
 * 默认不记录 SQL 与参数（参数可能是个人信息或正文）。
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export interface DbOptions {
  url: string;
  maxConnections?: number;
  statementTimeoutMs?: number;
  applicationName?: string;
}

export function createDb(options: DbOptions) {
  const sql = postgres(options.url, {
    max: options.maxConnections ?? 10,
    connection: {
      statement_timeout: options.statementTimeoutMs ?? 5000,
      application_name: options.applicationName ?? 'post-reader-server',
    },
    // 不把通知与参数写入日志
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql) };
}
